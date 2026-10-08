import { useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'

/** Week order used by the municipality (0 = السبت … 6 = الجمعة). */
export const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

/** [0, 3] → "السبت / الثلاثاء" */
export const formatDays = (days) => days.map((d) => DAYS[d]).join(' / ')

/** "النديم / عين جالوت\nنادي الزيتون" → ["النديم", "عين جالوت", "نادي الزيتون"] (trimmed, no blanks, no duplicates). */
export function parseAreas(text) {
  const names = []
  for (const part of String(text || '').split(/[\n/،]+/)) {
    const name = part.replace(/\s+/g, ' ').trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** Add / edit one row of the distribution table: days + addresses (+ optional note). */
export default function WaterRowForm({ row, onSubmit, onCancel }) {
  const [days, setDays] = useState(() => new Set(row?.days || []))
  const [areasText, setAreasText] = useState(() => (row?.area_list || []).map((a) => a.name).join('\n'))
  const [note, setNote] = useState(row?.note || '')
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ الموعد.')

  const toggleDay = (d) =>
    setDays((current) => {
      const next = new Set(current)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  const areas = parseAreas(areasText)

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!days.size) clientErrors.days = 'اختر يوماً واحداً على الأقل.'
    if (!areas.length) clientErrors.areas = 'أدخل عنواناً واحداً على الأقل.'
    submit(clientErrors, () => onSubmit({ days: [...days].sort((a, b) => a - b), areas, note: note.trim() }))
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FormAlert message={formError} />

      <fieldset>
        <legend className="label">الموعد (أيام وصول المياه)</legend>
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
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {errors.days && <p className="field-error">{errors.days}</p>}
      </fieldset>

      <Field id="water-areas" label="العنوان (المناطق والأماكن)" error={errors.areas}>
        <textarea
          id="water-areas"
          rows={8}
          className={`${controlClass(errors.areas)} leading-relaxed`}
          value={areasText}
          onChange={(e) => setAreasText(e.target.value)}
          placeholder={'اكتب كل عنوان في سطر، أو افصل بينها بـ /\nمثال: النديم / عين جالوت / نادي الزيتون'}
        />
        <p className="mt-1 text-xs text-muted">
          كل سطر أو كل جزء بين «/» يُعتبر عنواناً مستقلاً. عدد العناوين: <span className="num">{areas.length}</span>
        </p>
      </Field>

      <Field id="water-note" label="ملاحظة (اختياري)" error={errors.note}>
        <input id="water-note" className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <FormActions
        saving={saving}
        submitLabel={row ? 'حفظ التعديلات' : 'إضافة الموعد'}
        onCancel={onCancel}
        className="pt-1"
      />
    </form>
  )
}
