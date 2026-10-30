import { useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'
import { DAYS, formatDays } from './WaterRowForm'

/**
 * A water area drawn on «الخريطة»: its name and the days its water comes. The server puts it in the
 * table's row with those days (a new row when there is none): the form says which before saving.
 * `rows`: the distribution table (for the hint and the name suggestions).
 */
export default function WaterShapeForm({ shape, rows, onSubmit, onCancel }) {
  const [days, setDays] = useState(() => new Set(shape?.days || []))
  const [name, setName] = useState(shape?.name || '')
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ المنطقة.')

  const toggleDay = (d) =>
    setDays((current) => {
      const next = new Set(current)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  const picked = [...days].sort((a, b) => a - b)
  const row = picked.length ? (rows || []).find((r) => [...r.days].sort((a, b) => a - b).join() === picked.join()) : null
  const suggestions = [...new Set((rows || []).flatMap((r) => r.area_list.map((a) => a.name)))]

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!picked.length) clientErrors.water_days = 'اختر يوماً واحداً على الأقل.'
    if (!name.trim()) clientErrors.name = 'اسم المنطقة مطلوب.'
    submit(clientErrors, () => onSubmit({ water_days: picked, name: name.trim() }))
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert message={formError} />

      <fieldset>
        <legend className="label">
          أيام وصول المياه <span className="text-danger-600">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, d) => {
            const on = days.has(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                className={`tap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  on ? 'border-sky-600 bg-sky-600 text-white' : 'border-line bg-white text-ink hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {errors.water_days && <p className="field-error">{errors.water_days}</p>}
        {picked.length > 0 && (
          <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-sky-100" aria-live="polite">
            {row ? (
              <>
                ستُضاف إلى موعد <strong>«{row.days_text}»</strong> الموجود في جدول المياه.
              </>
            ) : (
              <>
                لا يوجد موعد «{formatDays(picked)}» في جدول المياه: سيُضاف موعد جديد بهذه الأيام.
              </>
            )}
          </p>
        )}
      </fieldset>

      <Field id="shape-name" label="اسم المنطقة *" error={errors.name}>
        <input
          id="shape-name"
          className={controlClass(errors.name)}
          value={name}
          maxLength={200}
          placeholder="مثال: النديم"
          list="shape-name-list"
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id="shape-name-list">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>

      <FormActions saving={saving} submitLabel={shape ? 'حفظ التعديلات' : 'حفظ المنطقة'} onCancel={onCancel} />
    </form>
  )
}
