import { useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import { authApi } from '../services/api'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'

const FIELDS = [
  ['current', 'كلمة المرور الحالية', 'current-password'],
  ['next', 'كلمة المرور الجديدة', 'new-password'],
  ['confirm', 'تأكيد كلمة المرور الجديدة', 'new-password'],
]

/** `inline`: inside a page (the profile) rather than a dialog — a plain button row, no «إلغاء». */
export default function ChangePasswordForm({ onDone, onCancel, inline = false }) {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const { errors, formError, saving, submit } = useFormSubmit('تعذر تغيير كلمة المرور.')

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!values.current) clientErrors.current = 'يرجى إدخال كلمة المرور الحالية.'
    if (!values.next) clientErrors.next = 'يرجى إدخال كلمة المرور الجديدة.'
    else if (values.next !== values.confirm) clientErrors.confirm = 'كلمتا المرور غير متطابقتين.'
    submit(
      clientErrors,
      async () => {
        await authApi.changePassword(values.current, values.next)
        onDone()
      },
      { mapFields: (fields) => ({ current: fields.current_password, next: fields.new_password }) },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      {FIELDS.map(([name, label, autoComplete]) => (
        <Field key={name} id={`cp-${name}`} label={label} error={errors[name]}>
          <input
            id={`cp-${name}`}
            type="password"
            dir="ltr"
            autoComplete={autoComplete}
            className={`${controlClass(errors[name])} text-right`}
            value={values[name]}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          />
        </Field>
      ))}
      <p className="text-xs text-muted">6 أحرف أو أرقام على الأقل.</p>
      {inline ? (
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={saving || !values.current || !values.next}>
            {saving ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
          </button>
        </div>
      ) : (
        <FormActions saving={saving} submitLabel="تغيير كلمة المرور" onCancel={onCancel} />
      )}
    </form>
  )
}
