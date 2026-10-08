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

export default function ChangePasswordForm({ onDone, onCancel }) {
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
      <p className="text-xs text-muted">8 أحرف على الأقل، ولا تكون أرقاماً فقط أو كلمة شائعة.</p>
      <FormActions saving={saving} submitLabel="تغيير كلمة المرور" onCancel={onCancel} />
    </form>
  )
}
