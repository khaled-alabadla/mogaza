import { useEffect, useState } from 'react'
import useFormSubmit from '../hooks/useFormSubmit'
import { waterSuppliesApi } from '../services/api'
import Field, { controlClass } from './Field'
import FormActions from './FormActions'
import FormAlert from './FormAlert'
import { DAYS, formatDays } from './WaterRowForm'

/**
 * A water area drawn on «الخريطة»: its name, the days its water comes and, for each day, when (optional),
 * and its source: «خط ماكروت» or one of the local wells (picked from a list; editors add new ones).
 * «يوجد عطل» is set on that source: every area it feeds shows it.
 * The server puts it in the table's row with those days (a new row when there is none): the form says which before saving.
 * `rows`: the distribution table (for the hint and the name suggestions).
 */
const SOURCE_KINDS = [
  ['mekorot', 'خط ماكروت'],
  ['well', 'الآبار المحلية'],
]

export default function WaterShapeForm({ shape, rows, onSubmit, onCancel }) {
  const [days, setDays] = useState(() => new Set(shape?.days || []))
  const [name, setName] = useState(shape?.name || '')
  // day → [from, to] ("08:00"); empty for a day without a time
  const [times, setTimes] = useState(() => shape?.times || {})
  const setTime = (d, i, value) =>
    setTimes((current) => {
      const window = [...(current[d] || ['', ''])]
      window[i] = value
      return { ...current, [d]: window }
    })
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ المنطقة.')

  // the water source
  const [supplies, setSupplies] = useState(null)
  const [kind, setKind] = useState(shape?.supply_info?.kind || '')
  const [wellId, setWellId] = useState(shape?.supply_info?.kind === 'well' ? String(shape.supply_info.id) : '')
  const [broken, setBroken] = useState(Boolean(shape?.supply_info?.broken))
  const [newWell, setNewWell] = useState(null) // the name being typed for a new well (null: closed)
  const [wellError, setWellError] = useState('')
  const [addingWell, setAddingWell] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    waterSuppliesApi
      .list(undefined, controller.signal)
      .then((list) => setSupplies(Array.isArray(list) ? list : list?.results || []))
      .catch(() => setSupplies([]))
    return () => controller.abort()
  }, [])
  const mekorot = (supplies || []).find((s) => s.kind === 'mekorot')
  const wells = (supplies || []).filter((s) => s.kind === 'well')
  const supply = kind === 'mekorot' ? mekorot : wells.find((w) => String(w.id) === wellId)
  // the fault box follows the source picked (a well already broken shows it ticked)
  const pickSupply = (next) => setBroken(Boolean(next?.broken))

  async function addWell() {
    const typed = (newWell || '').trim()
    if (!typed) {
      setWellError('اكتب اسم البئر.')
      return
    }
    setAddingWell(true)
    setWellError('')
    try {
      const saved = await waterSuppliesApi.create({ name: typed })
      setSupplies((list) => [...(list || []), saved])
      setWellId(String(saved.id))
      pickSupply(saved)
      setNewWell(null)
    } catch (err) {
      setWellError(err?.response?.data?.name?.[0] || 'تعذر إضافة البئر.')
    } finally {
      setAddingWell(false)
    }
  }

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
    if (!kind) clientErrors.supply = 'اختر مصدر المياه.'
    else if (!supply) clientErrors.supply = kind === 'well' ? 'اختر البئر.' : 'تعذر تحميل مصادر المياه.'
    const chosen = {}
    for (const d of picked) {
      const [from, to] = times[d] || ['', '']
      if (!from && !to) continue
      if (!from || !to) clientErrors.times = `أكمل وقت يوم ${DAYS[d]} (من وإلى) أو اتركه فارغاً.`
      else if (from === to) clientErrors.times = `وقت البداية يساوي وقت النهاية في يوم ${DAYS[d]}.`
      else chosen[d] = [from, to]
    }
    submit(clientErrors, () =>
      onSubmit({ water_days: picked, name: name.trim(), times: chosen, supply: supply.id, supply_broken: broken }),
    )
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

      {picked.length > 0 && (
        <fieldset>
          <legend className="label">
            وقت وصول المياه <span className="font-normal text-muted">(اختياري)</span>
          </legend>
          <ul className="space-y-2">
            {picked.map((d) => {
              const [from, to] = times[d] || ['', '']
              return (
                <li key={d} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-16 font-semibold text-ink">{DAYS[d]}</span>
                  <label className="flex items-center gap-1.5">
                    من
                    <input
                      type="time"
                      aria-label={`${DAYS[d]} من`}
                      className={`${controlClass(errors.times)} w-32 py-1.5`}
                      value={from}
                      onChange={(e) => setTime(d, 0, e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    إلى
                    <input
                      type="time"
                      aria-label={`${DAYS[d]} إلى`}
                      className={`${controlClass(errors.times)} w-32 py-1.5`}
                      value={to}
                      onChange={(e) => setTime(d, 1, e.target.value)}
                    />
                  </label>
                </li>
              )
            })}
          </ul>
          {errors.times && <p className="field-error">{errors.times}</p>}
        </fieldset>
      )}

      <fieldset>
        <legend className="label">
          مصدر المياه <span className="text-danger-600">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {SOURCE_KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value)
                pickSupply(value === 'mekorot' ? mekorot : wells.find((w) => String(w.id) === wellId))
              }}
              className={`tap rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                kind === value ? 'border-sky-600 bg-sky-600 text-white' : 'border-line bg-white text-ink hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === 'well' && (
          <div className="mt-3 space-y-2">
            <label htmlFor="shape-well" className="label">
              اسم البئر <span className="text-danger-600">*</span>
            </label>
            <select
              id="shape-well"
              className={controlClass(errors.supply)}
              value={wellId}
              disabled={!supplies}
              onChange={(e) => {
                setWellId(e.target.value)
                pickSupply(wells.find((w) => String(w.id) === e.target.value))
              }}
            >
              <option value="">{supplies ? (wells.length ? 'اختر البئر…' : 'لا توجد آبار بعد: أضف بئراً') : 'جارٍ التحميل…'}</option>
              {wells.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.broken ? `${w.name} (يوجد عطل)` : w.name}
                </option>
              ))}
            </select>
            {newWell === null ? (
              <button type="button" className="text-sm font-semibold text-sky-700 hover:underline" onClick={() => setNewWell('')}>
                + إضافة بئر جديد
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="اسم البئر الجديد"
                  className={`${controlClass(wellError)} min-w-0 flex-1`}
                  value={newWell}
                  maxLength={120}
                  placeholder="مثال: بئر الصفا"
                  onChange={(e) => setNewWell(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addWell()
                    }
                  }}
                />
                <button type="button" className="btn btn-primary" disabled={addingWell} onClick={addWell}>
                  {addingWell ? 'جارٍ الإضافة…' : 'إضافة'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setNewWell(null)
                    setWellError('')
                  }}
                >
                  إلغاء
                </button>
              </div>
            )}
            {wellError && <p className="field-error">{wellError}</p>}
          </div>
        )}
        {errors.supply && <p className="field-error">{errors.supply}</p>}

        {supply && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm ring-1 ring-red-100">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-600" checked={broken} onChange={(e) => setBroken(e.target.checked)} />
            <span>
              <span className="font-semibold text-red-700">يوجد عطل في {supply.name}</span>
              <span className="block text-xs text-muted">يظهر العطل على كل المناطق التي تتغذى من هذا المصدر.</span>
            </span>
          </label>
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
