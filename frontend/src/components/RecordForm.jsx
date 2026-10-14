import { useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'
import SearchableSelect from './SearchableSelect'

/**
 * Generic add/edit form. `fields` describes the inputs:
 *   { name, label, required, placeholder, maxLength, numeric, inputMode, multiline, rows, half, third, suggestions }
 *   (`half` / `third` = half / a third of the row on wider screens, otherwise the full row)
 * a select:   { name, label, type: 'select', options: [{ value, label }], emptyLabel, emptyValue, searchable }
 *             (`searchable`: a scrolling list that can be narrowed by typing, see SearchableSelect)
 *             (an empty select is submitted as `emptyValue`, null by default — '' for a text column)
 * a checkbox: { name, label, type: 'checkbox' }  (submitted as true / false)
 * `suggestions` (an array of strings) offers them while typing, but any text is accepted.
 *
 * A select without options (e.g. its list failed to load) is neither shown nor submitted,
 * so a failed request never wipes a stored value.
 */
export default function RecordForm({ fields: allFields, initial, submitLabel, onSubmit, onCancel }) {
  const fields = allFields.filter((f) => f.type !== 'select' || f.options?.length)
  const [values, setValues] = useState(() =>
    Object.fromEntries(allFields.map((f) => [f.name, initial?.[f.name] ?? (f.type === 'checkbox' ? false : '')])),
  )
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ البيانات.')

  const set = (name) => (e) =>
    setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function toPayloadValue(f, value) {
    if (f.type === 'checkbox') return Boolean(value)
    if (f.type === 'select') {
      if (value === '' || value == null) return f.emptyValue !== undefined ? f.emptyValue : null
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
      <div className="grid gap-4 sm:grid-cols-6">
        {fields.map((f) => {
          const id = `field-${f.name}`
          const error = errors[f.name]
          const span = f.third ? 'sm:col-span-2' : f.half ? 'sm:col-span-3' : 'sm:col-span-6'
          if (f.type === 'checkbox') {
            return (
              <label key={f.name} className={`tap flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink ${span}`}>
                <input
                  id={id}
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={Boolean(values[f.name])}
                  onChange={set(f.name)}
                />
                {f.label}
              </label>
            )
          }
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
            <Field key={f.name} id={id} label={label} error={error} className={span}>
              {f.type === 'select' && f.searchable ? (
                <SearchableSelect
                  id={id}
                  value={values[f.name]}
                  options={f.options}
                  placeholder={f.emptyLabel}
                  onChange={(value) => setValues((v) => ({ ...v, [f.name]: value }))}
                  className={common.className}
                  aria-invalid={common['aria-invalid']}
                  aria-describedby={common['aria-describedby']}
                />
              ) : f.type === 'select' ? (
                <select {...common}>
                  <option value="">{f.emptyLabel || '—'}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea rows={f.rows || 2} placeholder={f.placeholder} maxLength={f.maxLength} {...common} />
              ) : (
                <>
                  <input
                    type="text"
                    inputMode={f.inputMode || (f.numeric ? 'text' : undefined)}
                    dir={f.numeric ? 'ltr' : undefined}
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    list={f.suggestions?.length ? `${id}-list` : undefined}
                    autoComplete={f.suggestions?.length ? 'off' : undefined}
                    {...common}
                  />
                  {f.suggestions?.length > 0 && (
                    <datalist id={`${id}-list`}>
                      {f.suggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </Field>
          )
        })}
      </div>
      <FormActions saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  )
}
