import { useEffect, useId, useRef } from 'react'
import { X } from './WorkspaceIcons'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'

/** Shared shadcn/Radix dialog keeps each existing form and save handler intact. */
export default function WorkspaceDialog({ title, subtitle, icon: Icon, label = title, onClose, busy = false, footer, children, className = '' }) {
  const panel = useRef(null)
  const descriptionId = useId()
  const previous = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  useEffect(() => {
    if (busy) return
    const error = panel.current?.querySelector('.workspace-form-error')
    if (error) { error.tabIndex = -1; error.focus({ preventScroll: true }); error.scrollIntoView({ block: 'nearest' }) }
  }, [busy])
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose?.() }}>
    <DialogContent ref={panel} portalContainer={document.querySelector('.console-shell') || document.body} showCloseButton={false}
      overlayClassName="workspace-radix-overlay" className={`management-dialog workspace-dialog workspace-radix-dialog ${className}`}
      style={{ maxHeight: 'calc(100dvh - 36px)', overflowY: 'auto' }}
      aria-busy={busy || undefined} aria-describedby={subtitle ? descriptionId : undefined}
      onOpenAutoFocus={event => { event.preventDefault(); const first = panel.current?.querySelector('input:not([type="hidden"]):not(:disabled),textarea:not(:disabled),[role="combobox"]'); (first || panel.current)?.focus() }}
      onCloseAutoFocus={event => { event.preventDefault(); if (previous.current?.isConnected) previous.current.focus() }}
      onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
      onInteractOutside={event => { if (busy || event.target.closest?.('.workspace-select-popover')) event.preventDefault() }}>
      {!title && <DialogTitle className="sr-only">{label || 'Biểu mẫu'}</DialogTitle>}
      {title && <header className="workspace-dialog-heading">
        <div className="workspace-dialog-header-left">
          {Icon && <div className="workspace-dialog-icon-badge"><Icon size={20} /></div>}
          <div><DialogTitle className="workspace-dialog-title">{title}</DialogTitle>{subtitle && <DialogDescription id={descriptionId} className="workspace-dialog-subtitle">{subtitle}</DialogDescription>}</div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="workspace-dialog-close" data-intent="danger" onClick={onClose} disabled={busy} aria-label="Đóng cửa sổ"><X size={18} /></Button>
      </header>}
      {children}
      {footer && <DialogFooter data-modal-footer="edge" className="workspace-dialog-footer">{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>
}
