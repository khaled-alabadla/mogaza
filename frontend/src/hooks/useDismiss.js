import { useEffect } from 'react'

/**
 * Close a popup (dropdown, mobile menu) when the user presses Escape or presses anywhere
 * outside both `ref` (the popup) and `toggleRef` (the button that opens it, which keeps its
 * own toggle behaviour). Escape also hands the focus back to the toggle button.
 */
export default function useDismiss(open, close, ref, toggleRef) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (e) => {
      if (!ref.current?.contains(e.target) && !toggleRef.current?.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      close()
      toggleRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, ref, toggleRef])
}
