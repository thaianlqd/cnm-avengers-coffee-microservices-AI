import { useEffect, useLayoutEffect, useRef } from 'react'
import { X } from './WorkspaceIcons'

const dialogs = []
let savedOverflow = ''
const focusable = node => [...node.querySelectorAll('input:not([type="hidden"]),textarea,select,button,a[href],[tabindex="0"]')]
  .filter(element => !element.disabled && element.getAttribute('tabindex') !== '-1' && element.getClientRects().length)

export default function WorkspaceDialog({
  title,
  subtitle,
  icon: Icon,
  label = title,
  onClose,
  busy = false,
  footer,
  children,
  className = ''
}) {
  const panel = useRef(null)
  const close = useRef(onClose)
  const saving = useRef(busy)
  useLayoutEffect(() => { close.current = onClose; saving.current = busy }, [onClose, busy])
  useEffect(() => {
    const node = panel.current
    const previous = document.activeElement
    if (!dialogs.length) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    dialogs.push(node)
    const first = node?.querySelector('input:not([type="hidden"]):not(:disabled),textarea:not(:disabled),select:not(:disabled)') || focusable(node)[0]
    ;(first || node)?.focus()
    const keydown = event => {
      if (dialogs.at(-1) !== node || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!saving.current) close.current?.()
      }
      if (event.key !== 'Tab') return
      const controls = focusable(node), first = controls[0], last = controls.at(-1)
      if (!controls.length) { event.preventDefault(); node.focus(); return }
      const outside = !node.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || outside || document.activeElement === node)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || outside || document.activeElement === node)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      const index = dialogs.indexOf(node)
      if (index >= 0) dialogs.splice(index, 1)
      if (!dialogs.length) document.body.style.overflow = savedOverflow
      if (previous?.isConnected) previous.focus?.()
    }
  }, [])
  useEffect(() => {
    if (busy) return
    const error = panel.current?.querySelector('.workspace-form-error')
    if (error) {
      error.tabIndex = -1
      error.focus({ preventScroll: true })
      error.scrollIntoView({ block: 'nearest' })
    }
  }, [busy])
  return (
    <div className="management-dialog-backdrop" onMouseDown={event => { if (!saving.current && event.target === event.currentTarget) close.current?.() }}>
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={`management-dialog workspace-dialog ${className}`}
      >
        {title && (
          <header className="workspace-dialog-heading">
            <div className="workspace-dialog-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              {Icon && (
                <div className="workspace-dialog-icon-badge" style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={19} />
                </div>
              )}
              <div>
                <h3 className="workspace-dialog-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.015em' }}>{title}</h3>
                {subtitle && <p className="workspace-dialog-subtitle" style={{ margin: '3px 0 0 0', fontSize: '0.8125rem', color: '#64748b', fontWeight: '500' }}>{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              className="workspace-icon-button workspace-dialog-close"
              onClick={onClose}
              disabled={busy}
              aria-label="Đóng cửa sổ"
              title="Đóng cửa sổ"
            >
              <X size={18} />
            </button>
          </header>
        )}
        {children}
        {footer && (
          <footer className="workspace-dialog-footer">
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}
