import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
const WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg' }

export default function Modal({ open, title, onClose, children, size = 'md' }) {
  const panelRef = useRef(null)
  const titleId = useId()
  // Read the latest onClose from a ref: parents pass inline functions, and re-running the effect
  // on every parent render would move the focus back to the first field.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    // With stacked dialogs (e.g. a confirm inside a modal) only the topmost one reacts to keys.
    const isTopmost = () => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      return dialogs[dialogs.length - 1] === panelRef.current
    }
    const onKey = (e) => {
      if (!isTopmost()) return
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      // keep Tab / Shift+Tab inside the dialog
      const items = panelRef.current.querySelectorAll(FOCUSABLE)
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const first = panelRef.current?.querySelector('input, textarea, select, button[data-autofocus]')
    first?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null

  // Portal to <body> so an ancestor (e.g. the blurred sticky header) can't trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92dvh] w-full ${WIDTHS[size]} overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line py-3 ps-5 pe-3">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="إغلاق" disabled={!onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
