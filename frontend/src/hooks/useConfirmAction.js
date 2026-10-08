import { useState } from 'react'
import { useToast } from '../context/ToastContext'
import { parseApiError } from '../utils/errors'

/**
 * State for a «هل أنت متأكد؟» dialog: `ask(record)` opens it, `confirm()` runs `action(record)`,
 * shows a toast and closes it (or keeps it open and shows the error).
 */
export default function useConfirmAction(action, { success, fallback, onDone }) {
  const toast = useToast()
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await action(target)
      toast.success(success)
      setTarget(null)
      onDone?.()
    } catch (err) {
      toast.error(parseApiError(err, fallback).message)
    } finally {
      setBusy(false)
    }
  }

  return { target, ask: setTarget, cancel: () => setTarget(null), busy, confirm }
}
