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

/** Where an area gets its water from. "" = not classified yet (shown in «جدول المياه» only). */
export const WATER_SOURCES = [
  { value: 'mekorot', label: 'خط ماكروت', hint: 'المناطق التي تتغذى من خط ماكروت' },
  { value: 'wells', label: 'الآبار المحلية', hint: 'المناطق التي تتغذى من الآبار المحلية' },
  { value: '', label: 'غير مصنّف', hint: 'تظهر في «جدول المياه» فقط حتى تُصنَّف' },
]

/** The row's areas as one text per source: { mekorot: "…\n…", wells: "…", "": "…" }. */
function textsBySource(areaList) {
  return Object.fromEntries(
    WATER_SOURCES.map(({ value }) => [
      value,
      (areaList || [])
        .filter((a) => (a.source || '') === value)
        .map((a) => a.name)
        .join('\n'),
    ]),
  )
}

/** Add / edit one row of the distribution table: days + addresses grouped by water source (+ optional note). */
export default function WaterRowForm({ row, onSubmit, onCancel }) {
  const [days, setDays] = useState(() => new Set(row?.days || []))
  const [texts, setTexts] = useState(() => textsBySource(row?.area_list))
  const [note, setNote] = useState(row?.note || '')
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ الموعد.')

  const toggleDay = (d) =>
    setDays((current) => {
      const next = new Set(current)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  // a name typed in two boxes keeps the first one (same rule as the server)
  const areas = []
  for (const { value: source } of WATER_SOURCES) {
    for (const name of parseAreas(texts[source])) {
      if (!areas.some((a) => a.name === name)) areas.push({ name, source })
    }
  }

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
        {!row && (
          <p className="mt-2 text-xs text-muted">إذا كان في الجدول موعد بنفس الأيام، تُضاف العناوين إليه تلقائياً بدل إنشاء موعد جديد.</p>
        )}
      </fieldset>

      <fieldset>
        <legend className="label">العنوان (المناطق والأماكن) حسب مصدر المياه</legend>
        <p className="mb-3 text-xs text-muted">
          اكتب كل عنوان في سطر، أو افصل بينها بـ «/». عدد العناوين: <span className="num">{areas.length}</span>
        </p>
        <div className="space-y-3">
          {WATER_SOURCES.map(({ value, label, hint }) => (
            <Field key={value || 'none'} id={`water-areas-${value || 'none'}`} label={label}>
              <textarea
                id={`water-areas-${value || 'none'}`}
                rows={value ? 4 : 3}
                className={`${controlClass(errors.areas)} leading-relaxed`}
                value={texts[value]}
                onChange={(e) => setTexts((t) => ({ ...t, [value]: e.target.value }))}
                placeholder={hint}
              />
            </Field>
          ))}
        </div>
        {errors.areas && <p className="field-error">{errors.areas}</p>}
      </fieldset>

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
