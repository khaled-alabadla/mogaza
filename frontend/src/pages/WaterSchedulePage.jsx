import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import logo from '../assets/logo-320.webp'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { EditIcon, PrintIcon, TrashIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import Segmented from '../components/Segmented'
import WaterRowForm, { DAYS, formatDays, WATER_SOURCES } from '../components/WaterRowForm'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import { waterTableApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { useText } from '../context/ContentContext'

/** The three views of the table: everything, or only the areas fed by one water source. */
const VIEWS = [
  { value: '', tab: 'جدول المياه', title: 'جدول توزيع المياه', subtitle: 'حسب توجيهات المواطنين' },
  { value: 'mekorot', tab: 'خط ماكروت', title: 'جدول المياه — خط ماكروت', subtitle: 'المناطق التي تتغذى من خط ماكروت' },
  { value: 'wells', tab: 'الآبار المحلية', title: 'جدول المياه — الآبار المحلية', subtitle: 'المناطق التي تتغذى من الآبار المحلية' },
]

/** The printed page: A4 portrait, a row never split across two pages. */
const PRINT_CSS = '@page { size: A4 portrait; margin: 12mm; }'

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

  async function save(payload) {
    if (editing.row) {
      await waterTableApi.update(editing.row.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await waterTableApi.create(payload)
      toast.success('تمت إضافة الموعد.')
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
          <p className="text-base font-bold text-black">بلدية غزة — قسم المعلومات والشكاوي</p>
          <p className="mt-0.5 text-xl font-bold text-black">{view.title}</p>
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
        <Segmented
          label="مصدر المياه"
          value={view.value}
          onChange={(value) => setSearchParams(value ? { source: value } : {}, { replace: true })}
          options={VIEWS.map((v) => ({ value: v.value, label: v.tab }))}
          className="self-start"
        />
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
        {!rows.length ? (
          <EmptyState title={`لا توجد نتائج مطابقة لـ «${query}»`} hint="جرّب كتابة جزء أقصر من اسم المنطقة." />
        ) : (
          <div className="card overflow-hidden print:rounded-none print:border-gray-600 print:shadow-none">
            {/* header (≥640px), like the paper */}
            <div className="hidden grid-cols-[11rem_1fr] border-b border-line bg-canvas text-sm font-semibold text-muted sm:grid print:text-ink print:grid print:grid-cols-[11rem_1fr] print:border-gray-600 print:bg-gray-100 print:[print-color-adjust:exact]">
              <div className="border-l border-line px-4 py-3 text-center print:border-gray-600">الموعد</div>
              <div className="px-4 py-3 text-start print:text-center">العنوان</div>
            </div>
            <ul className="divide-y divide-line print:divide-gray-600">
              {rows.map(({ row, matches }) => {
                const isToday = row.days.includes(data.today)
                return (
                  <li key={row.id} className={`break-inside-avoid sm:grid sm:grid-cols-[11rem_1fr] print:grid print:grid-cols-[11rem_1fr] ${isToday ? 'bg-brand-50/50 print:bg-transparent' : ''}`}>
                    <div
                      className={`flex items-center justify-between gap-2 border-line px-4 py-3 sm:flex-col sm:justify-center sm:border-l sm:text-center print:flex-col print:justify-center print:border-l print:border-gray-600 print:bg-transparent print:text-center ${
                        isToday ? 'bg-brand-50 print:bg-transparent' : 'bg-canvas sm:bg-transparent'
                      }`}
                    >
                      <div className={`text-base font-bold ${isToday ? 'text-brand-700' : 'text-ink'} print:text-ink`}>{formatDays(row.days)}</div>
                      {isToday && (
                        <span className="badge bg-brand-600 text-white shadow-sm print:hidden">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden="true" />
                          تصل المياه اليوم
                        </span>
                      )}
                      {canEdit && (
                        <div className="flex gap-0.5 print:hidden sm:mt-1">
                          <button type="button" className="icon-action" aria-label="تعديل" title="تعديل" onClick={() => setEditing({ row: fullRow(row) })}>
                            <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                          </button>
                          <button type="button" className="icon-action icon-action-danger" aria-label="حذف" title="حذف" onClick={() => deletion.ask(fullRow(row))}>
                            <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      <p className="text-[0.95rem] leading-8 text-ink">
                        {row.area_list.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && <span className="mx-1.5 text-gray-300 print:text-muted">/</span>}
                            <span className={matches && matches.has(a.id) ? 'rounded bg-gold-100 px-1 font-semibold' : undefined}>
                              {!view.value && SOURCE_DOTS[a.source] && (
                                <span
                                  className={`me-1 inline-block h-2 w-2 rounded-full align-middle print:hidden ${SOURCE_DOTS[a.source]}`}
                                  title={a.source_display}
                                  aria-label={a.source_display}
                                />
                              )}
                              {a.name}
                            </span>
                          </span>
                        ))}
                      </p>
                      {row.note && <p className="mt-2.5 text-sm text-muted">ملاحظة: {row.note}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
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
