import { useState } from 'react'
import { parseApiError } from '../utils/errors'

/**
 * Shared submit flow of the forms: client-side errors first, then the request, then
 * the server's Arabic messages ({ field: message } + a form-level banner).
 *
 *   const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ البيانات.')
 *   submit(clientErrors, () => api.save(payload), { mapFields, onError })
 */
export default function useFormSubmit(fallbackMessage) {
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(clientErrors, action, { mapFields = (fields) => fields, onError } = {}) {
    setErrors(clientErrors)
    setFormError('')
    if (Object.keys(clientErrors).length) return
    setSaving(true)
    try {
      await action()
    } catch (err) {
      const parsed = parseApiError(err, fallbackMessage)
      setErrors(mapFields(parsed.fields))
      setFormError(parsed.message)
      onError?.()
    } finally {
      setSaving(false)
    }
  }

  return { errors, formError, saving, submit }
}
