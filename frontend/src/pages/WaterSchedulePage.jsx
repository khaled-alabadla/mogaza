import { useCallback, useEffect, useMemo, useState } from 'react'
import { AddButton, DeleteButton, EditButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import SearchInput from '../components/SearchInput'
import WaterRowForm, { DAYS, formatDays } from '../components/WaterRowForm'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import { waterTableApi } from '../services/api'
import { normalizeArabic } from '../utils/arabic'
import { parseApiError } from '../utils/errors'

/** «جدول توزيع المياه حسب توجيهات المواطنين» — the official sheet, with add / edit / delete. */
export default function WaterSchedulePage() {
  const { canEdit } = useAuth()
  const toast = useToast()
  const [data, setData] = useState({ today: null, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { row | null }

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

  // Normalised once per load, so typing in the search box only compares strings.
  const searchable = useMemo(
    () =>
      data.results.map((row) => ({
        row,
        dayText: normalizeArabic(row.days.map((d) => DAYS[d]).join(' ')),
        areas: row.area_list.map((a) => ({ id: a.id, text: normalizeArabic(a.name) })),
      })),
    [data.results],
  )

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

  return (
    <div>
      <PageHeader title="جدول توزيع المياه" subtitle="حسب توجيهات المواطنين">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          طباعة
        </button>
        {canEdit && <AddButton onClick={openAdd}>إضافة موعد</AddButton>}
      </PageHeader>

      <SearchInput
        className="mb-5 print:hidden"
        label="البحث في جدول المياه"
        placeholder="ابحث عن منطقتك لمعرفة موعد المياه… (مثال: الدرج، دوار حيدر)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <AsyncContent
        loading={loading}
        error={error}
        onRetry={load}
        isEmpty={!data.results.length}
        empty={
          <EmptyState title="لا توجد مواعيد في الجدول" action={canEdit ? <AddButton onClick={openAdd}>إضافة موعد</AddButton> : null} />
        }
      >
        {!rows.length ? (
          <EmptyState title={`لا توجد نتائج مطابقة لـ «${query}»`} hint="جرّب كتابة جزء أقصر من اسم المنطقة." />
        ) : (
          <div className="card overflow-hidden">
            {/* header (≥640px), like the paper */}
            <div className="hidden grid-cols-[11rem_1fr] border-b border-line bg-canvas text-sm font-bold text-ink sm:grid">
              <div className="border-l border-line px-4 py-3 text-center">الموعد</div>
              <div className="px-4 py-3 text-center">العنوان</div>
            </div>
            <ul className="divide-y divide-line">
              {rows.map(({ row, matches }) => {
                const isToday = row.days.includes(data.today)
                return (
                  <li key={row.id} className={`sm:grid sm:grid-cols-[11rem_1fr] ${isToday ? 'bg-brand-50/50 print:bg-transparent' : ''}`}>
                    <div
                      className={`flex items-center justify-between gap-2 border-line px-4 py-3 sm:flex-col sm:justify-center sm:border-l sm:text-center ${
                        isToday ? 'bg-brand-50 print:bg-transparent' : 'bg-canvas sm:bg-transparent'
                      }`}
                    >
                      <div className="text-base font-bold text-ink">{formatDays(row.days)}</div>
                      {isToday && (
                        <span className="badge bg-brand-600 text-white print:hidden">
                          تصل المياه اليوم
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-4">
                      <p className="text-[0.98rem] leading-8 text-ink">
                        {row.area_list.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && <span className="mx-1 text-muted">/</span>}
                            <span
                              className={
                                matches && matches.has(a.id) ? 'rounded bg-gold-100 px-1 font-semibold text-ink' : undefined
                              }
                            >
                              {a.name}
                            </span>
                          </span>
                        ))}
                      </p>
                      {row.note && <p className="mt-2 text-sm text-muted">ملاحظة: {row.note}</p>}
                      {canEdit && (
                        <div className="mt-3 flex justify-end gap-2 print:hidden">
                          <EditButton onClick={() => setEditing({ row })} />
                          <DeleteButton onClick={() => deletion.ask(row)} />
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </AsyncContent>

      <Modal
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
