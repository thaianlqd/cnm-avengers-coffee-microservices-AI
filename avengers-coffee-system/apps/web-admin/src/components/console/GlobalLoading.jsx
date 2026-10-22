import React from 'react'

/**
 * GlobalLoading component for standard loading animations across the entire application using pure Tailwind CSS.
 *
 * Props:
 * - text: string (e.g. "Đang tải dữ liệu Kiosk...")
 * - subtext: string (e.g. "Vui lòng chờ trong giây lát")
 * - size: 'mini' | 'sm' | 'md' | 'lg' (default: 'md')
 * - fullscreen: boolean (if true, covers entire screen with frosted backdrop)
 * - minHeight: string | number (default: '220px' for inline/card mode)
 * - style: object
 */
export function GlobalLoading({
  text = 'Đang tải dữ liệu...',
  subtext,
  size = 'md',
  fullscreen = false,
  minHeight = '220px',
  style = {}
}) {
  const sizeMap = {
    mini: { wrap: 'w-4 h-4', border: 'border-2', dot: 'w-1 h-1' },
    sm: { wrap: 'w-7 h-7', border: 'border-2', dot: 'w-1.5 h-1.5' },
    md: { wrap: 'w-11 h-11', border: 'border-[2.5px]', dot: 'w-2.5 h-2.5' },
    lg: { wrap: 'w-16 h-16', border: 'border-[3px]', dot: 'w-3.5 h-3.5' }
  }

  const s = sizeMap[size] || sizeMap.md

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3.5 w-full py-8 px-4 box-border ${
        fullscreen ? 'fixed inset-0 z-[99999] bg-white/85 backdrop-blur-sm' : ''
      }`}
      style={{
        ...(!fullscreen ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight } : {}),
        ...style
      }}
      role="status"
      aria-live="polite"
    >
      <div className={`relative inline-flex items-center justify-center ${s.wrap}`}>
        <div className={`absolute inset-0 rounded-full ${s.border} border-slate-200 border-t-blue-600 border-r-blue-500 animate-spin`} />
        <div className={`rounded-full bg-blue-600 animate-pulse ${s.dot}`} />
      </div>

      {(text || subtext) && (
        <div className="flex flex-col items-center gap-1 text-center">
          {text && <span className="text-sm font-semibold text-slate-800 tracking-tight">{text}</span>}
          {subtext && <span className="text-xs text-slate-500 font-normal">{subtext}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Small inline spinner for buttons or badges
 */
export function GlobalSpinner({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0 align-middle"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        color,
        ...style
      }}
      role="status"
      aria-hidden="true"
    />
  )
}

export default GlobalLoading
