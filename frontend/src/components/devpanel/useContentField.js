import { useState } from 'react'
import { useContentStore } from '../../context/ContentContext'
import { useToast } from '../../context/ToastContext'
import { contentApi } from '../../services/api'
import { parseApiError } from '../../utils/errors'

/** Save / reset one content value from the developer dashboard (and update the site's copy at once). */
export default function useContentField(key) {
  const store = useContentStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const current = store?.overrides?.[key]

  async function run(action, success, fallback) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      return true
    } catch (err) {
      toast.error(parseApiError(err, fallback).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = (value) =>
    run(
      async () => {
        await contentApi.save(key, value)
        store.setOverrides((o) => ({ ...o, [key]: value }))
      },
      'تم الحفظ.',
      'تعذر الحفظ.',
    )

  const reset = () =>
    run(
      async () => {
        await contentApi.reset(key)
        store.setOverrides((o) => {
          const next = { ...o }
          delete next[key]
          return next
        })
      },
      'تمت استعادة الأصل.',
      'تعذرت الاستعادة.',
    )

  return { current, overridden: current !== undefined, busy, save, reset }
}
