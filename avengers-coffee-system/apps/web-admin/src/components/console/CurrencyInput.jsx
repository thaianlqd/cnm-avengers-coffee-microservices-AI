import React, { useRef, useLayoutEffect } from 'react'

export function formatCurrencyInput(val) {
  if (val === null || val === undefined || val === '') return ''
  const numStr = String(val).replace(/\D/g, '')
  if (!numStr) return ''
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function parseCurrencyInput(str) {
  if (str === null || str === undefined || str === '') return 0
  const clean = String(str).replace(/\D/g, '')
  return clean ? Number(clean) : 0
}

export default function CurrencyInput({
  value,
  onChange,
  placeholder = '0',
  className = '',
  disabled = false,
  required = false,
  id,
  name,
  min,
  max,
  style,
  autoFocus,
  onKeyDown,
  allowZero = false,
  ...rest
}) {
  const inputRef = useRef(null)
  const cursorRef = useRef(null)

  // Format display value with dots (000.000)
  const displayValue = formatCurrencyInput(value)

  const handleChange = (e) => {
    const el = e.target
    const rawVal = el.value
    const prevCursor = el.selectionStart

    // Count digits before cursor
    const digitsBeforeCursor = rawVal.slice(0, prevCursor).replace(/\D/g, '').length

    // Extract digits only
    const digits = rawVal.replace(/\D/g, '')
    const numericValue = digits ? Number(digits) : (allowZero ? 0 : '')

    cursorRef.current = digitsBeforeCursor

    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: {
          ...el,
          name: el.name,
          id: el.id,
          value: numericValue,
          rawValue: numericValue,
          valueAsString: digits,
          formattedValue: formatCurrencyInput(digits)
        }
      }
      onChange(syntheticEvent)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && inputRef.current) {
      const el = inputRef.current
      const start = el.selectionStart
      const end = el.selectionEnd
      // If cursor is right after a dot, delete the digit before the dot
      if (start === end && start > 0 && el.value[start - 1] === '.') {
        e.preventDefault()
        const prevValue = el.value
        const newValue = prevValue.slice(0, start - 2) + prevValue.slice(start)
        const digits = newValue.replace(/\D/g, '')
        const numVal = digits ? Number(digits) : (allowZero ? 0 : '')
        cursorRef.current = Math.max(0, newValue.slice(0, start - 2).replace(/\D/g, '').length)

        if (onChange) {
          onChange({
            ...e,
            target: {
              ...el,
              name: el.name,
              id: el.id,
              value: numVal,
              rawValue: numVal,
              valueAsString: digits,
              formattedValue: formatCurrencyInput(digits)
            }
          })
        }
        return
      }
    }
    if (onKeyDown) onKeyDown(e)
  }

  useLayoutEffect(() => {
    if (cursorRef.current !== null && inputRef.current) {
      const el = inputRef.current
      const currentVal = el.value
      let digitCount = 0
      let newPos = currentVal.length

      for (let i = 0; i < currentVal.length; i++) {
        if (/\d/.test(currentVal[i])) {
          digitCount++
        }
        if (digitCount >= cursorRef.current) {
          newPos = i + 1
          break
        }
      }

      if (cursorRef.current === 0) {
        newPos = 0
      }

      el.setSelectionRange(newPos, newPos)
      cursorRef.current = null
    }
  }, [displayValue])

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      style={style}
      autoComplete="off"
      {...rest}
    />
  )
}
