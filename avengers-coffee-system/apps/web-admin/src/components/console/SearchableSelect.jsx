import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search, X } from './WorkspaceIcons'

// Helper to normalize Vietnamese search text
function normalizeSearch(val) {
  return String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

/**
 * Standardized Custom Select & Autocomplete Combobox
 * - Unified modern design (never uses unstyled native OS select).
 * - Click to open suggestion list.
 * - Real-time filtering when user types keywords.
 * - Seamlessly accepts standard <option> children OR options array.
 * - Dispatches synthetic events compatible with both e.target.value and direct value handlers.
 */
export default function SearchableSelect({
  children,
  options,
  value,
  defaultValue,
  onChange,
  name,
  id,
  placeholder = '-- Chọn --',
  className = '',
  style,
  disabled = false,
  required = false,
  autoFocus = false,
  prefixIcon,
  icon,
  clearable = true,
  ...props
}) {
  const generatedId = useId()
  const componentId = id || generatedId
  const listId = `${componentId}-options`

  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [placement, setPlacement] = useState({})

  // Parse options from either explicit `options` prop or `<option>` children
  const parsedOptions = useMemo(() => {
    if (Array.isArray(options) && options.length > 0) {
      return options.map((opt) => ({
        value: opt.value,
        label: opt.label || String(opt.value),
        rawLabel: String(opt.rawLabel || opt.label || opt.value || ''),
        displayLabel: opt.displayLabel,
        disabled: Boolean(opt.disabled),
        icon: opt.icon,
        isParent: Boolean(opt.isParent),
        isChild: Boolean(opt.isChild),
        level: opt.level !== undefined ? opt.level : (opt.isChild ? 2 : opt.isParent ? 1 : undefined),
        badge: opt.badge,
        divider: Boolean(opt.divider),
      }))
    }

    const list = []
    React.Children.forEach(children, (child) => {
      if (!child || !child.props) return
      if (child.props.value !== undefined) {
        const rawLabel = typeof child.props.children === 'string'
          ? child.props.children
          : Array.isArray(child.props.children)
            ? child.props.children.map((c) => (typeof c === 'string' ? c : '')).join('')
            : String(child.props.children || child.props.value || '')

        list.push({
          value: child.props.value,
          label: child.props.children || String(child.props.value),
          rawLabel: rawLabel.trim(),
          displayLabel: child.props['data-display-label'] || child.props.displayLabel,
          disabled: Boolean(child.props.disabled),
          icon: child.props['data-icon'] || child.props.icon,
          isParent: Boolean(child.props['data-is-parent'] || child.props.isParent),
          isChild: Boolean(child.props['data-is-child'] || child.props.isChild),
          level: child.props['data-level'] || child.props.level,
          badge: child.props['data-badge'] || child.props.badge,
          divider: Boolean(child.props['data-divider'] || child.props.divider),
        })
      }
    })
    return list
  }, [options, children])

  // Current selected option
  const currentVal = value !== undefined ? value : defaultValue
  const selectedOption = useMemo(() => {
    return parsedOptions.find((opt) => String(opt.value) === String(currentVal))
  }, [parsedOptions, currentVal])

  // Filter options based on typed query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return parsedOptions
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
    return parsedOptions.filter((opt) => {
      if (opt.disabled) return false
      const text = normalizeSearch(`${opt.rawLabel} ${opt.value}`)
      return terms.every((term) => text.includes(term))
    })
  }, [parsedOptions, query])

  // Handle outside click to close
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target) &&
        listRef.current &&
        !listRef.current.contains(e.target)
      ) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [])

  // Position calculation for portal popover
  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      if (!rootRef.current) return
      const rect = rootRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - 10
      const spaceAbove = rect.top - 10
      const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow

      // Ensure comfortable width so hierarchy and long names are completely visible without clipping
      const minComfortWidth = Math.max(rect.width, 280)
      const maxAvailableWidth = window.innerWidth - 24
      const popoverWidth = Math.min(Math.max(minComfortWidth, 310), maxAvailableWidth)
      const popoverLeft = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))

      setPlacement({
        position: 'fixed',
        left: popoverLeft,
        width: popoverWidth,
        minWidth: Math.min(rect.width, popoverWidth),
        maxHeight: Math.max(160, Math.min(360, showAbove ? spaceAbove : spaceBelow)),
        zIndex: 99999,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // Scroll active option into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-highlighted="true"]')
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [open, highlightIndex])

  // Choose option
  const chooseOption = (opt) => {
    if (!opt || opt.disabled) return
    const synthEvent = {
      target: { name, value: opt.value, id: componentId },
      currentTarget: { name, value: opt.value, id: componentId },
      value: opt.value,
    }
    onChange?.(synthEvent)
    setOpen(false)
    setQuery('')
  }

  // Handle Trigger Click
  const handleTriggerClick = () => {
    if (disabled) return
    if (!open) {
      setOpen(true)
      setQuery('')
      const initialIdx = filteredOptions.findIndex(
        (o) => String(o.value) === String(currentVal)
      )
      setHighlightIndex(initialIdx >= 0 ? initialIdx : 0)
      setTimeout(() => inputRef.current?.focus(), 20)
    } else {
      setOpen(false)
      setQuery('')
    }
  }

  // Admin fields are styled by the shared theme; legacy actors keep their existing control.
  useLayoutEffect(() => {
    if (inputRef.current && !rootRef.current?.closest('.admin-workspace')) {
      inputRef.current.style.setProperty('border', 'none', 'important')
      inputRef.current.style.setProperty('border-width', '0', 'important')
      inputRef.current.style.setProperty('outline', 'none', 'important')
      inputRef.current.style.setProperty('box-shadow', 'none', 'important')
      inputRef.current.style.setProperty('background', 'transparent', 'important')
      inputRef.current.style.setProperty('background-color', 'transparent', 'important')
      inputRef.current.style.setProperty('border-radius', '0', 'important')
      inputRef.current.style.setProperty('padding', '0', 'important')
      inputRef.current.style.setProperty('margin', '0', 'important')
      inputRef.current.style.setProperty('min-height', '0', 'important')
      inputRef.current.style.setProperty('height', '100%', 'important')
    }
  })

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        setHighlightIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
      } else {
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
      }
    } else if (e.key === 'Enter') {
      if (open && filteredOptions[highlightIndex]) {
        e.preventDefault()
        chooseOption(filteredOptions[highlightIndex])
      }
    }
  }

  const displayText = open
    ? query
    : selectedOption
      ? selectedOption.displayLabel || selectedOption.rawLabel || selectedOption.label
      : ''

  return (
    <div
      ref={rootRef}
      id={componentId}
      className={`standard-searchable-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minHeight: '40px',
        height: '40px',
        padding: 0,
        backgroundColor: disabled ? '#f8fafc' : '#ffffff',
        border: open ? '1px solid #2563eb' : '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: open
          ? '0 0 0 3px rgba(37, 99, 235, 0.18), 0 1px 2px 0 rgba(15, 23, 42, 0.06)'
          : '0 1px 2px 0 rgba(15, 23, 42, 0.05), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
        transition: 'border-color 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}
      onClick={handleTriggerClick}
      onKeyDown={handleKeyDown}
      data-disabled={disabled || undefined}
    >
      {/* Hidden input for standard HTML form submission and validation */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={currentVal ?? ''}
          disabled={disabled}
        />
      )}

      {/* Optional Prefix Icon */}
      {(prefixIcon || icon) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: '12px',
            flexShrink: 0,
            pointerEvents: 'none',
          }}
        >
          {prefixIcon || icon}
        </div>
      )}

      {/* Autocomplete Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 0,
          paddingLeft: (prefixIcon || icon) ? '6px' : '10px',
          paddingRight: '4px',
          height: '100%',
          border: 'none',
          background: 'transparent',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          className="standard-select-input"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={open ? 'Nhập từ khóa để lọc...' : (selectedOption ? (selectedOption.rawLabel || selectedOption.label) : placeholder)}
          value={displayText}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlightIndex(0)
            if (!open) setOpen(true)
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (!open) handleTriggerClick()
          }}
          onFocus={() => {
            if (!disabled && !open) handleTriggerClick()
          }}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 0,
            border: 'none',
            borderWidth: 0,
            outline: 'none',
            background: 'transparent',
            backgroundColor: 'transparent',
            boxShadow: 'none',
            borderRadius: 0,
            fontSize: '13.5px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: '-0.01em',
            color: selectedOption || open ? '#0f172a' : '#94a3b8',
            fontWeight: selectedOption && !open ? '500' : '450',
            cursor: disabled ? 'not-allowed' : 'text',
            padding: 0,
            margin: 0,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          title={selectedOption ? (selectedOption.rawLabel || selectedOption.label) : undefined}
        />
      </div>

      {/* Right Action / Chevron Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          paddingRight: '8px',
          paddingLeft: '3px',
          flexShrink: 0,
          color: '#71717a',
        }}
      >
        {/* Clear selection button when an actual non-empty value is selected */}
        {Boolean(clearable && selectedOption && selectedOption.value && !disabled && !open) && (
          <button
            type="button"
            className="searchable-select-clear-btn admin-search-clear-btn"
            aria-label="Xóa chọn"
            title="Xóa lựa chọn"
            onClick={(e) => {
              e.stopPropagation()
              chooseOption({ value: '', label: '', rawLabel: '' })
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              minWidth: '18px',
              minHeight: '18px',
              background: '#f1f5f9',
              backgroundColor: '#f1f5f9',
              border: 0,
              borderWidth: 0,
              boxShadow: 'none',
              outline: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#64748b',
              borderRadius: '50%',
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        )}

        <ChevronDown
          size={14}
          style={{
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(180deg)' : 'none',
            color: open ? '#2563eb' : '#71717a',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Floating Suggestions Dropdown */}
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="standard-select-popover workspace-select-popover"
            style={{
              ...placement,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              backgroundColor: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.05)',
              padding: '4px',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              scrollbarWidth: 'thin',
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => {
                const isSelected = String(opt.value) === String(currentVal)
                const isHighlighted = highlightIndex === index
                const isParent = Boolean(opt.isParent || opt.level === 1)
                const isChild = Boolean(opt.isChild || opt.level === 2)

                return (
                  <React.Fragment key={`${opt.value}-${index}`}>
                    {/* Visual Divider before parent groups (except first item or when searching) */}
                    {opt.divider && index > 0 && !query.trim() && (
                      <div
                        style={{
                          height: '1px',
                          backgroundColor: '#f1f5f9',
                          margin: '6px 4px',
                        }}
                      />
                    )}

                    <button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-highlighted={isHighlighted}
                      disabled={opt.disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        chooseOption(opt)
                      }}
                      onMouseEnter={() => setHighlightIndex(index)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: isChild ? '6.5px 8px 6.5px 24px' : '7.5px 8px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: isHighlighted
                          ? '#f1f5fb'
                          : isSelected
                            ? '#eff6ff'
                            : 'transparent',
                        color: isSelected
                          ? '#1d4ed8'
                          : isParent
                            ? '#0f172a'
                            : '#334155',
                        fontWeight: isSelected ? '600' : isParent ? '600' : '400',
                        fontSize: isParent ? '13px' : '12.5px',
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        transition: 'background-color 0.1s ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {isChild && (
                          <span
                            style={{
                              color: isSelected ? '#3b82f6' : '#94a3b8',
                              fontSize: '12px',
                              lineHeight: 1,
                              flexShrink: 0,
                              userSelect: 'none',
                              fontFamily: 'monospace',
                            }}
                          >
                            ↳
                          </span>
                        )}
                        {isParent && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isSelected ? '#2563eb' : '#64748b',
                              fontSize: '13px',
                              flexShrink: 0,
                            }}
                          >
                            📁
                          </span>
                        )}
                        <span
                          style={{
                            lineHeight: '1.35',
                            wordBreak: 'break-word',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {opt.label}
                        </span>
                      </div>

                      {/* Right badge: e.g. "33 món" or "Tất cả" */}
                      {opt.badge && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '1.5px 6px',
                            borderRadius: '4px',
                            backgroundColor: isSelected
                              ? '#dbeafe'
                              : isParent
                                ? '#eff6ff'
                                : '#f8fafc',
                            color: isSelected
                              ? '#1e40af'
                              : isParent
                                ? '#2563eb'
                                : '#64748b',
                            border: isSelected
                              ? '1px solid #bfdbfe'
                              : isParent
                                ? '1px solid #dbeafe'
                                : '1px solid #e2e8f0',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            marginLeft: '6px',
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}

                      {isSelected && (
                        <Check
                          size={14}
                          style={{ color: '#2563eb', flexShrink: 0, marginLeft: '6px' }}
                        />
                      )}
                    </button>
                  </React.Fragment>
                )
              })
            ) : (
              <div
                style={{
                  padding: '12px 14px',
                  color: '#71717a',
                  fontSize: '13px',
                  textAlign: 'center',
                  lineHeight: '1.4',
                }}
              >
                Không tìm thấy gợi ý phù hợp cho &quot;<strong>{query}</strong>&quot;
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
