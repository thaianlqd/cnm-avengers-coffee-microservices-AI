import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, Check } from './WorkspaceIcons'
import { filterSelectOptions } from './smartSelectModel'

export default function SmartSelect({ options = [], value = '', onChange, placeholder = 'Gõ để tìm...', disabled = false, label, id, name, required = false, style, className = '', onBlur, autoFocus = false, ...inputProps }) {
  const root = useRef(null)
  const list = useRef(null)
  const input = useRef(null)
  const generatedId = useId()
  const inputId = id || generatedId
  const listId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [placement, setPlacement] = useState({})
  const selected = options.find(option => String(option.value) === String(value))
  const matches = useMemo(() => filterSelectOptions(options, query), [options, query])
  const activeIndex = Math.max(0, Math.min(highlight, matches.length - 1))

  useEffect(() => {
    const close = event => {
      if (!root.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    input.current?.setCustomValidity(required && (!selected || String(selected.value) === '') ? 'Vui lòng chọn một kết quả trong danh sách.' : '')
  }, [required, selected])
  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])
  useEffect(() => {
    if (!open) return
    const update = () => {
      const box = root.current?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - 12
      const above = box.top - 12
      const upwards = below < 220 && above > below
      setPlacement({ position: 'fixed', left: Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8)), width: Math.min(box.width, window.innerWidth - 16),
        maxHeight: Math.max(80, Math.min(280, upwards ? above : below)),
        ...(upwards ? { bottom: window.innerHeight - box.top + 5 } : { top: box.bottom + 5 }) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open])

  const choose = option => {
    onChange?.(option.value)
    setQuery('')
    setOpen(false)
    setHighlight(0)
  }
  const showOptions = () => {
    setOpen(true)
    setQuery('')
    setHighlight(Math.max(0, filterSelectOptions(options, '').findIndex(option => String(option.value) === String(value))))
  }
  return <div className={`smart-select ${className}`} ref={root} style={style} data-disabled={disabled || undefined}>
    {name && <input type="hidden" name={name} value={value ?? ''} disabled={disabled} />}
    <input {...inputProps} ref={input} id={inputId} type="text" role="combobox" aria-label={label || inputProps['aria-label'] || (!id ? placeholder : undefined)} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined} disabled={disabled} aria-required={required || undefined} autoComplete="off" autoFocus={autoFocus}
      style={{ paddingRight: '28px', textOverflow: 'ellipsis', ...inputProps.style }}
      value={open ? query : selected?.label || ''} placeholder={open ? 'Nhập từ khóa để lọc…' : placeholder}
      onFocus={showOptions} onClick={() => { if (!open) showOptions() }}
      onBlur={event => { setOpen(false); onBlur?.(event) }}
      onChange={event => { setQuery(event.target.value); setHighlight(0); setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) showOptions(); else setHighlight(Math.min(activeIndex + 1, matches.length - 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) showOptions(); else setHighlight(Math.max(activeIndex - 1, 0)) }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (matches[activeIndex]) choose(matches[activeIndex]) }
      }} />
    <ChevronDown size={14} aria-hidden="true" />
    {open && !disabled && createPortal(<div ref={list} className="workspace-select-popover" style={placement} id={listId} role="listbox" aria-label={label || 'Kết quả tìm kiếm'}>
      {matches.length ? matches.map((option, index) => <button id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={String(option.value) === String(value)}
        data-active={activeIndex === index} className={activeIndex === index ? 'is-highlighted' : ''} key={option.value} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{option.label}</span>{String(option.value) === String(value) && <Check size={16} aria-hidden="true" />}</button>)
        : <p role="status">Không tìm thấy kết quả phù hợp.</p>}
    </div>, document.body)}
  </div>
}
