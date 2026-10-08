import { useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'

/**
 * Generic add/edit form. `fields` describes the inputs:
 *   { name, label, required, placeholder, maxLength, numeric, multiline, half }
 * a select: { name, label, type: 'select', options: [{ value, label }], emptyLabel }
 *
 * A select without options (e.g. its list failed to load) is neither shown nor submitted,
 * so a failed request never wipes a stored value; an empty select is submitted as null.
 */
export default function RecordForm({ fields: allFields, initial, submitLabel, onSubmit, onCancel }) {
  const fields = allFields.filter((f) => f.type !== 'select' || f.options?.length)
  const [values, setValues] = useState(() =>
    Object.fromEntries(allFields.map((f) => [f.name, initial?.[f.name] ?? ''])),
  )
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ البيانات.')

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }))

  function toPayloadValue(f, value) {
    if (f.type === 'select') {
      if (value === '' || value == null) return null
      const option = f.options.find((o) => String(o.value) === String(value))
      return option ? option.value : value
    }
    return String(value || '').trim()
  }

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    for (const f of fields) {
      if (f.required && !String(values[f.name] || '').trim()) clientErrors[f.name] = `${f.label} مطلوب.`
    }
    submit(clientErrors, () =>
      onSubmit(Object.fromEntries(fields.map((f) => [f.name, toPayloadValue(f, values[f.name])]))),
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `field-${f.name}`
          const error = errors[f.name]
          const common = {
            id,
            name: f.name,
            value: values[f.name] ?? '',
            onChange: set(f.name),
            'aria-invalid': Boolean(error),
            'aria-describedby': error ? `${id}-error` : undefined,
            className: `${controlClass(error)} ${f.numeric ? 'num text-right' : ''}`,
          }
          const label = (
            <>
              {f.label} {f.required && <span className="text-danger-600">*</span>}
            </>
          )
          return (
            <Field key={f.name} id={id} label={label} error={error} className={f.half ? '' : 'sm:col-span-2'}>
              {f.type === 'select' ? (
                <select {...common}>
                  <option value="">{f.emptyLabel || '—'}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea rows={2} placeholder={f.placeholder} maxLength={f.maxLength} {...common} />
              ) : (
                <input
                  type="text"
                  inputMode={f.numeric ? 'text' : undefined}
                  dir={f.numeric ? 'ltr' : undefined}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  {...common}
                />
              )}
            </Field>
          )
        })}
      </div>
      <FormActions saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  )
}
