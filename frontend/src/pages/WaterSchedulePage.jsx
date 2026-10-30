import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import logo from '../assets/logo-320.webp'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { CalendarIcon, ChevronDownIcon, DropIcon, EditIcon, PrintIcon, TrashIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import WaterRowForm, { DAYS, formatDays, WATER_SOURCES } from '../components/WaterRowForm'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import { waterTableApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { useText } from '../context/ContentContext'
import useLiveRefresh from '../hooks/useLiveRefresh'

/** The three views of the table: everything, or only the areas fed by one water source. */
const VIEWS = [
  { value: '', tab: 'جدول المياه', title: 'جدول توزيع المياه', subtitle: 'حسب توجيهات المواطنين' },
  { value: 'mekorot', tab: 'خط ماكروت', title: 'جدول مياه خط ماكروت', subtitle: 'المناطق التي تتغذى من خط ماكروت' },
  { value: 'wells', tab: 'الآبار المحلية', title: 'جدول مياه الآبار المحلية', subtitle: 'المناطق التي تتغذى من الآبار المحلية' },
]

/** The printed page: A4 portrait, a row never split across two pages. */
const PRINT_CSS = '@page { size: A4 portrait; margin: 12mm; }'

/** Two ways to read the same table: one row per weekday (the default), or as on the paper (one row per set of days). */
const MODES = [
  { value: '', label: 'حسب الأيام' },
  { value: 'schedule', label: 'حسب المواعيد' },
]

/** «اليوم» / «غداً (الثلاثاء)» / «الخميس (بعد 3 أيام)»: when the water comes next, from today. */
function nextVisit(days, today) {
  if (today === null || today === undefined || !days.length) return null
  const offset = Math.min(...days.map((d) => (d - today + 7) % 7))
  const name = DAYS[(today + offset) % 7]
  if (offset === 0) return { text: 'اليوم', today: true }
  if (offset === 1) return { text: `غداً (${name})` }
  if (offset === 2) return { text: `${name} (بعد يومين)` }
  return { text: `${name} (بعد ${offset} أيام)` }
}

const byArabicName = (a, b) => a.name.localeCompare(b.name, 'ar')

/** A compact list (icon, choice, arrow) used for the display mode and the water source. */
function PillSelect({ label, icon: Icon, value, onChange, options }) {
  return (
    <div className="relative flex h-[2.625rem] items-center rounded-xl bg-white shadow-[0_1px_2px_rgb(16_24_40/0.05)] ring-1 ring-line transition-shadow focus-within:ring-2 focus-within:ring-brand-500 hover:ring-gray-300">
      <Icon className="pointer-events-none absolute start-3 h-4 w-4 text-brand-600" />
      <select
        aria-label={label}
        className="h-full cursor-pointer appearance-none rounded-xl bg-transparent ps-9 pe-9 text-sm font-semibold text-ink focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value || 'all'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 h-4 w-4 text-muted" />
    </div>
  )
}

/** Small coloured dot marking an area's source in the full table (no dot = not classified). */
const SOURCE_DOTS = { mekorot: 'bg-brand-600', wells: 'bg-gold-400' }

/** «جدول توزيع المياه حسب توجيهات المواطنين» — the official sheet, with add / edit / delete. */
export default function WaterSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const found = VIEWS.find((v) => v.value === searchParams.get('source')) || VIEWS[0]
  // the full table's title / subtitle are editable from the developer dashboard
  const waterTitle = useText('water.title')
  const waterSubtitle = useText('water.subtitle')
  const view = found.value ? found : { ...found, title: waterTitle || found.title, subtitle: waterSubtitle }
  const mode = searchParams.get('by') === 'schedule' ? 'schedule' : 'days'
  // change one URL parameter, keep the other (source ↔ display mode)
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const { can } = useAuth()
  const canEdit = can('water.edit')
  const toast = useToast()
  const [data, setData] = useState({ today: null, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { row | null }
  const [printedAt, setPrintedAt] = useState(() => new Date())

  // the printed header shows when it was printed (button or Ctrl+P)
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintedAt(new Date()))
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  const load = useCallback((signal) => {
    setLoading(true)
    setError('')
    return waterTableApi
      .list(undefined, signal)
      .then(setData)
      .catch((err) => {
        if (!signal?.aborted && err?.code !== 'ERR_CANCELED') setError(parseApiError(err, 'تعذر تحميل جدول المياه.').message)
      })
      .finally(() => {
        // an aborted (superseded) request must not end the loading state of the one that replaced it
        if (!signal?.aborted) setLoading(false)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // what a colleague changes in the table shows without a reload (quietly, only when it changed)
  useLiveRefresh(
    () =>
      waterTableApi
        .list()
        .then((fresh) => setData((previous) => (JSON.stringify(previous) === JSON.stringify(fresh) ? previous : fresh)))
        .catch(() => {}),
    { enabled: !loading && !error },
  )

  // The current view's rows (a source view keeps only that source's areas, and drops rows left empty),
  // normalised once so typing in the search box only compares strings.
  const searchable = useMemo(
    () =>
      data.results
        .map((row) =>
          view.value ? { ...row, area_list: row.area_list.filter((a) => a.source === view.value) } : row,
        )
        .filter((row) => row.area_list.length)
        .map((row) => ({
          row,
          dayText: normalizeArabic(row.days.map((d) => DAYS[d]).join(' ')),
          areas: row.area_list.map((a) => ({ id: a.id, text: normalizeArabic(a.name) })),
        })),
    [data.results, view.value],
  )
  const hasClassified = data.results.some((row) => row.area_list.some((a) => a.source))

  // The table is small (a handful of rows), so filtering it in the browser is fine.
  const rows = useMemo(() => {
    const terms = normalizeArabic(query).split(' ').filter(Boolean)
    if (!terms.length) return searchable.map(({ row }) => ({ row, matches: null }))
    return searchable
      .map(({ row, dayText, areas }) => {
        const matches = new Set(areas.filter((a) => terms.every((t) => a.text.includes(t))).map((a) => a.id))
        const dayHit = terms.every((t) => dayText.includes(t))
        return matches.size || dayHit ? { row, matches: dayHit ? null : matches } : null
      })
      .filter(Boolean)
  }, [searchable, query])

  // «حسب الأيام»: every weekday with all the areas served that day, from every row (an area listed in two
  // rows of the same day is shown once). Starts with today, then the coming days in order.
  // Follows the source tab and the search.
  const byDay = useMemo(
    () =>
      DAYS.map((_, i) => (data.today === null || data.today === undefined ? i : (data.today + i) % DAYS.length)).map((day) => {
        const name = DAYS[day]
        const seen = new Set()
        const areas = []
        for (const { row, matches } of rows) {
          if (!row.days.includes(day)) continue
          for (const a of row.area_list) {
            if (seen.has(a.name)) continue
            seen.add(a.name)
            areas.push({ ...a, hit: Boolean(matches && matches.has(a.id)) })
          }
        }
        return { day, name, areas }
      }),
    [rows, data.today],
  )

  // The direct answer to «when does water reach X?»: each matching area with all its days, from every row
  // (in the current source tab). Not shown when the search is a weekday.
  const answers = useMemo(() => {
    const terms = normalizeArabic(query).split(' ').filter(Boolean)
    if (!terms.length) return []
    const found = new Map()
    for (const { row, areas } of searchable) {
      areas.forEach((a, i) => {
        if (!terms.every((t) => a.text.includes(t))) return
        const area = row.area_list[i]
        const entry = found.get(area.name) || { name: area.name, source: area.source_display && area.source ? area.source_display : '', days: new Set() }
        row.days.forEach((d) => entry.days.add(d))
        found.set(area.name, entry)
      })
    }
    return [...found.values()]
      .map((a) => ({ ...a, days: [...a.days].sort((x, y) => x - y) }))
      .sort(byArabicName)
  }, [searchable, query])

  const searchedDay = useMemo(() => {
    const terms = normalizeArabic(query).split(' ').filter(Boolean)
    if (!terms.length) return null
    const day = DAYS.findIndex((name) => terms.every((t) => normalizeArabic(name).includes(t)))
    return day === -1 ? null : day
  }, [query])

  async function save(payload) {
    if (editing.row) {
      await waterTableApi.update(editing.row.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      const saved = await waterTableApi.create(payload)
      // the same days as an existing row: the addresses went into that row
      if (!saved.merged) toast.success('تمت إضافة الموعد.')
      else if (saved.added) toast.success(`أُضيفت العناوين إلى موعد «${saved.days_text}» الموجود.`)
      else toast.success(`العناوين موجودة أصلاً في موعد «${saved.days_text}».`)
    }
    setEditing(null)
    load()
  }

  const deletion = useConfirmAction((row) => waterTableApi.remove(row.id), {
    success: 'تم حذف الموعد.',
    fallback: 'تعذر حذف الموعد.',
    onDone: () => load(),
  })

  const openAdd = () => setEditing({ row: null })
  // the original row (all sources), so editing from a source view never drops the other areas
  const fullRow = (row) => data.results.find((r) => r.id === row.id) || row

  return (
    <div>
      <style>{PRINT_CSS}</style>
      {/* the printed page gets a formal letterhead instead of the screen header */}
      <header className="mb-4 hidden items-center gap-4 border-b-2 border-gray-700 pb-3 print:flex">
        <img src={logo} alt="" className="h-16 w-16 object-contain" />
        <div className="flex-1">
          <p className="text-base font-bold text-black">بلدية غزة | قسم المعلومات والشكاوي</p>
          <p className="mt-0.5 text-xl font-bold text-black">
            {view.title}
            {mode === 'days' && ' (حسب الأيام)'}
          </p>
          {query.trim() && <p className="text-xs text-gray-700">نتائج البحث عن: «{query.trim()}»</p>}
        </div>
        <p className="text-xs text-gray-700">
          تاريخ الطباعة: <span className="font-medium">{formatDateTime(printedAt)}</span>
        </p>
      </header>

      <div className="print:hidden">
        <PageHeader title={view.title} subtitle={view.subtitle}>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <PrintIcon className="h-4 w-4" /> طباعة
          </button>
          {canEdit && <AddButton onClick={openAdd}>إضافة موعد</AddButton>}
        </PageHeader>
      </div>

      <div className="mb-5 flex flex-col gap-3 print:hidden lg:flex-row lg:items-center">
        {/* the display mode and the water source: two compact lists */}
        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          <PillSelect
            label="طريقة العرض"
            icon={CalendarIcon}
            value={mode === 'schedule' ? 'schedule' : ''}
            onChange={(value) => setParam('by', value)}
            options={MODES}
          />
          <PillSelect
            label="مصدر المياه"
            icon={DropIcon}
            value={view.value}
            onChange={(value) => setParam('source', value)}
            options={VIEWS.map((v) => ({ value: v.value, label: v.tab }))}
          />
        </div>
        <SearchInput
          className="flex-1"
          label="البحث في جدول المياه"
          placeholder="ابحث عن منطقتك لمعرفة موعد المياه… (مثال: الدرج، دوار حيدر)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!view.value && hasClassified && (
          <ul className="flex shrink-0 flex-wrap gap-3 text-xs text-muted" aria-label="دليل الألوان">
            {WATER_SOURCES.filter((src) => SOURCE_DOTS[src.value]).map((src) => (
              <li key={src.value} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${SOURCE_DOTS[src.value]}`} aria-hidden="true" />
                {src.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        onRetry={load}
        isEmpty={!searchable.length}
        empty={
          view.value ? (
            <EmptyState
              title={`لا توجد مناطق مصنّفة على «${view.tab}» بعد`}
              hint={canEdit ? 'صنّف المناطق حسب مصدر المياه من زر «تعديل» في جدول المياه.' : undefined}
            />
          ) : (
            <EmptyState title="لا توجد مواعيد في الجدول" action={canEdit ? <AddButton onClick={openAdd}>إضافة موعد</AddButton> : null} />
          )
        }
      >
        {searchedDay === null && answers.length > 0 && (
          <section aria-label="موعد المياه للمنطقة" className="mb-4 grid gap-2.5 sm:grid-cols-2 print:hidden">
            {answers.slice(0, 6).map((a) => {
              const next = nextVisit(a.days, data.today)
              return (
                <div key={a.name} className={`card p-4 ${next?.today ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
                  <p className="text-lg font-bold text-ink">{a.name}</p>
                  <p className="mt-1 text-sm text-ink">
                    تصلها المياه: <span className="font-semibold">{a.days.map((d) => DAYS[d]).join(' و')}</span>
                  </p>
                  {next && (
                    <p className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold ${next.today ? 'bg-brand-600 text-white' : 'bg-gold-100 text-gold-700'}`}>
                      {next.today ? 'تصل المياه اليوم' : `الموعد القادم: ${next.text}`}
                    </p>
                  )}
                  {a.source && <p className="mt-2 text-xs text-muted">المصدر: {a.source}</p>}
                </div>
              )
            })}
            {answers.length > 6 && (
              <p className="text-sm text-muted sm:col-span-2">
                و<span className="num">{answers.length - 6}</span> مناطق أخرى مطابقة في الجدول أدناه.
              </p>
            )}
          </section>
        )}

        {!rows.length ? (
          <EmptyState title={`لا توجد نتائج مطابقة لـ «${query}»`} hint="جرّب كتابة جزء أقصر من اسم المنطقة." />
        ) : mode === 'days' ? (
          <div className="card divide-y divide-line overflow-hidden print:rounded-none print:border-gray-600 print:shadow-none print:divide-gray-600">
            {byDay
              // searching a weekday («الثلاثاء») shows that day only; otherwise days without a match are hidden
              .filter((d) => (searchedDay === null ? d.areas.length || !query.trim() : d.day === searchedDay))
              .map(({ day, name, areas }) => {
                const isToday = day === data.today
                const isTomorrow = data.today !== null && data.today !== undefined && day === (data.today + 1) % 7
                const sorted = [...areas].sort(byArabicName)
                return (
                  <section key={day} aria-label={name} className={`break-inside-avoid ${isToday ? 'bg-brand-50/40 print:bg-transparent' : ''}`}>
                    <h3 className="flex items-center gap-3 px-4 pt-3.5 pb-2 sm:px-5 print:py-2">
                      <span className={`text-base font-bold ${isToday ? 'text-brand-700' : 'text-ink'} print:text-ink`}>{name}</span>
                      {isToday && (
                        <span className="badge bg-brand-600 text-white shadow-sm print:hidden">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden="true" />
                          تصل المياه اليوم
                        </span>
                      )}
                      {isTomorrow && <span className="badge bg-gold-100 text-gold-700 print:hidden">غداً</span>}
                    </h3>
                    <div className="px-4 pb-4 sm:px-5">
                      {sorted.length ? (
                        <ul className="columns-2 gap-x-6 text-[0.95rem] leading-8 text-ink sm:columns-3 lg:columns-4">
                          {sorted.map((a) => (
                            <li key={a.name} className="flex items-baseline gap-2 break-inside-avoid">
                              <span
                                className={`mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full ${(!view.value && SOURCE_DOTS[a.source]) || 'bg-gray-300'} print:bg-gray-500`}
                                title={a.source ? a.source_display : undefined}
                                aria-hidden="true"
                              />
                              <span className={a.hit ? 'rounded bg-gold-100 px-1 font-semibold' : undefined}>{a.name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted">لا توجد مواعيد في هذا اليوم.</p>
                      )}
                    </div>
                  </section>
                )
              })}
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden print:rounded-none print:border-gray-600 print:shadow-none print:divide-gray-600">
            {rows.map(({ row, matches }) => {
              const isToday = row.days.includes(data.today)
              const isTomorrow = !isToday && data.today !== null && data.today !== undefined && row.days.includes((data.today + 1) % 7)
              const sorted = [...row.area_list].sort(byArabicName)
              return (
                <li key={row.id} className={`break-inside-avoid ${isToday ? 'bg-brand-50/40 print:bg-transparent' : ''}`}>
                  <div className="flex items-center gap-2 pe-2 sm:pe-3">
                    <h3 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5 pb-2 sm:px-5 print:py-2">
                      <span className={`text-base font-bold ${isToday ? 'text-brand-700' : 'text-ink'} print:text-ink`}>{formatDays(row.days)}</span>
                      {isToday && (
                        <span className="badge bg-brand-600 text-white shadow-sm print:hidden">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden="true" />
                          تصل المياه اليوم
                        </span>
                      )}
                      {isTomorrow && <span className="badge bg-gold-100 text-gold-700 print:hidden">غداً</span>}
                    </h3>
                    {canEdit && (
                      <div className="flex shrink-0 gap-0.5 print:hidden">
                        <button type="button" className="icon-action" aria-label="تعديل" title="تعديل" onClick={() => setEditing({ row: fullRow(row) })}>
                          <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                        </button>
                        <button type="button" className="icon-action icon-action-danger" aria-label="حذف" title="حذف" onClick={() => deletion.ask(fullRow(row))}>
                          <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="px-4 pb-4 sm:px-5">
                    <ul className="columns-2 gap-x-6 text-[0.95rem] leading-8 text-ink sm:columns-3 lg:columns-4">
                      {sorted.map((a) => (
                        <li key={a.id} className="flex items-baseline gap-2 break-inside-avoid">
                          {!view.value && SOURCE_DOTS[a.source] ? (
                            <span
                              className={`mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE_DOTS[a.source]} print:bg-gray-500`}
                              title={a.source_display}
                              aria-label={a.source_display}
                            />
                          ) : (
                            <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300 print:bg-gray-500" aria-hidden="true" />
                          )}
                          <span className={matches && matches.has(a.id) ? 'rounded bg-gold-100 px-1 font-semibold' : undefined}>{a.name}</span>
                        </li>
                      ))}
                    </ul>
                    {row.note && <p className="mt-2.5 text-sm text-muted">ملاحظة: {row.note}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </AsyncContent>

      <Modal
        size="form"
        open={Boolean(editing)}
        title={editing?.row ? 'تعديل الموعد' : 'إضافة موعد جديد'}
        onClose={() => setEditing(null)}
      >
        {editing && <WaterRowForm row={editing.row} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message="هل أنت متأكد من حذف هذا الموعد وكل عناوينه من الجدول؟"
        details={deletion.target ? formatDays(deletion.target.days) : ''}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
