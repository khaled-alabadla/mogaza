import { useMemo, useState } from 'react'
import { AddButton, DeleteButton, EditButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { CheckIcon, DownloadIcon, RestoreIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import { COMPLAINT_FIELDS, COMPLAINT_KINDS } from '../components/recordFields'
import SearchInput from '../components/SearchInput'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { complaintsApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 20

const TABS = [
  { value: 'pending', label: 'بانتظار الرفع' },
  { value: 'uploaded', label: 'تم الرفع' },
  { value: '', label: 'الكل' },
]

const KIND_TONES = { complaint: 'bg-danger-50 text-danger-700', inquiry: 'bg-brand-50 text-brand-700' }
const STATUS_TONES = { pending: 'bg-gold-100 text-gold-700', uploaded: 'bg-brand-50 text-brand-700' }

function Detail({ label, children, ltr }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      {/* numbers keep their LTR order (isolated span) but stay right-aligned like the Arabic values */}
      <dd className="truncate text-sm font-medium text-ink">{ltr && children ? <span className="num">{children}</span> : children || '—'}</dd>
    </div>
  )
}

function ComplaintCard({ complaint: c, selected, onSelect, onToggleUploaded, onEdit, onDelete }) {
  const uploaded = c.status === 'uploaded'
  return (
    <li className={`card p-4 transition-colors sm:p-5 ${selected ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
      <div className="flex items-start gap-3">
        <label className="tap -m-2 flex shrink-0 cursor-pointer items-start justify-center p-2">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-brand-600"
            checked={selected}
            onChange={(e) => onSelect(c.id, e.target.checked)}
            aria-label={`تحديد ${c.kind_display} ${c.name}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${KIND_TONES[c.kind]}`}>{c.kind_display}</span>
            <h3 className="font-bold text-ink">{c.category}</h3>
            <span className={`badge ${STATUS_TONES[c.status]}`}>{c.status_display}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            سُجّلت {formatDateTime(c.created_at)}
            {c.created_by_name && ` بواسطة ${c.created_by_name}`}
            {uploaded && c.uploaded_at && ` · رُفعت ${formatDateTime(c.uploaded_at)}`}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <Detail label="الاسم">{c.name}</Detail>
            <Detail label="رقم الهوية" ltr>
              {c.national_id}
            </Detail>
            <Detail label="رقم الجوال" ltr>
              <a href={`tel:${c.phone}`} className="hover:text-brand-700 hover:underline">
                {c.phone}
              </a>
            </Detail>
            <Detail label="النقطة">{c.point}</Detail>
            <Detail label="رقم المبنى" ltr>
              {c.building_number}
            </Detail>
            <Detail label="رقم الشارع" ltr>
              {c.street_number}
            </Detail>
            <div className="col-span-2">
              <Detail label="العنوان">{c.address}</Detail>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <button type="button" className="btn btn-secondary" onClick={() => onToggleUploaded([c.id], !uploaded)}>
              {uploaded ? <RestoreIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
              {uploaded ? 'إرجاع إلى بانتظار الرفع' : 'تم الرفع'}
            </button>
            <EditButton onClick={() => onEdit(c)} />
            <DeleteButton onClick={() => onDelete(c)} />
          </div>
        </div>
      </div>
    </li>
  )
}

/** «الشكاوى المؤقتة»: complaints recorded while the main system is down, then marked as uploaded. */
export default function ComplaintsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // { complaint | null }
  const debounced = useDebouncedValue(search)

  const filters = useMemo(
    () => ({ upload: tab || undefined, kind: kind || undefined, search: debounced.trim() || undefined }),
    [tab, kind, debounced],
  )
  const params = useMemo(() => ({ ...filters, page, page_size: PAGE_SIZE }), [filters, page])
  // the CSV export uses the same filters as the list (all pages)
  const exportHref = complaintsApi.exportUrl(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
  const { data, loading, error, reload } = usePagedList(complaintsApi.list, params)

  function refresh() {
    setSelected(new Set())
    reload()
  }
  const changeFilter = (setter) => (value) => {
    setter(value)
    setPage(1)
    setSelected(new Set())
  }

  const deletion = useConfirmAction((c) => complaintsApi.remove(c.id), {
    success: 'تم حذف الشكوى.',
    fallback: 'تعذر حذف الشكوى.',
    onDone: refresh,
  })

  async function save(payload) {
    if (editing.complaint) {
      await complaintsApi.update(editing.complaint.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await complaintsApi.create(payload)
      toast.success('تم تسجيل الشكوى.')
    }
    setEditing(null)
    refresh()
  }

  async function setUploaded(ids, uploaded) {
    try {
      const { updated } = await complaintsApi.markUploaded(ids, uploaded)
      toast.success(uploaded ? `تم تعليم ${updated} كمرفوعة.` : `أُعيدت ${updated} إلى بانتظار الرفع.`)
      refresh()
    } catch (err) {
      toast.error(parseApiError(err, 'تعذر تحديث الحالة.').message)
    }
  }

  function select(id, on) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const pageIds = data.results.map((c) => c.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const pendingCount = data.pending_count

  return (
    <div>
      <PageHeader
        title="الشكاوى المؤقتة"
        subtitle="سجّل الشكاوى والاستفسارات أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه."
      >
        <a className="btn btn-secondary" href={exportHref}>
          <DownloadIcon className="h-4 w-4" /> تصدير Excel
        </a>
        <AddButton onClick={() => setEditing({ complaint: null })}>تسجيل شكوى</AddButton>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="inline-flex shrink-0 rounded-xl border border-line bg-white p-1" role="tablist" aria-label="حالة الرفع">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => changeFilter(setTab)(t.value)}
              className={`tap flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.value ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
              {t.value === 'pending' && pendingCount > 0 && (
                <span
                  className={`num rounded-full px-1.5 text-xs ${tab === t.value ? 'bg-white/20' : 'bg-gold-100 text-gold-700'}`}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <select className="input lg:w-44" value={kind} onChange={(e) => changeFilter(setKind)(e.target.value)} aria-label="نوع الطلب">
          <option value="">كل الأنواع</option>
          {COMPLAINT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <SearchInput
          className="flex-1"
          label="البحث في الشكاوى"
          placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو نوع الشكوى…"
          value={search}
          onChange={(e) => changeFilter(setSearch)(e.target.value)}
        />
      </div>

      {data.results.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-2.5">
          <label className="tap flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={allOnPage}
              onChange={(e) => setSelected(e.target.checked ? new Set(pageIds) : new Set())}
            />
            تحديد الكل في هذه الصفحة
            {selected.size > 0 && <span className="text-muted">(تم تحديد <span className="num">{selected.size}</span>)</span>}
          </label>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {tab !== 'uploaded' && (
                <button type="button" className="btn btn-primary" onClick={() => setUploaded([...selected], true)}>
                  <CheckIcon className="h-4 w-4" /> تعليم المحدد «تم الرفع»
                </button>
              )}
              {tab !== 'pending' && (
                <button type="button" className="btn btn-secondary" onClick={() => setUploaded([...selected], false)}>
                  <RestoreIcon className="h-4 w-4" /> إرجاع إلى بانتظار الرفع
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <AsyncContent
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={!data.results.length}
        empty={
          <EmptyState
            title={
              debounced.trim() || kind
                ? 'لا توجد شكاوى مطابقة'
                : tab === 'pending'
                  ? 'لا توجد شكاوى بانتظار الرفع'
                  : 'لا توجد شكاوى'
            }
            hint={tab === 'pending' && !debounced.trim() && !kind ? 'كل الشكاوى المسجلة تم رفعها إلى النظام الرئيسي.' : undefined}
            action={<AddButton onClick={() => setEditing({ complaint: null })}>تسجيل شكوى</AddButton>}
          />
        }
      >
        <ul className="space-y-3">
          {data.results.map((c) => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              selected={selected.has(c.id)}
              onSelect={select}
              onToggleUploaded={setUploaded}
              onEdit={(complaint) => setEditing({ complaint })}
              onDelete={deletion.ask}
            />
          ))}
        </ul>
        <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
      </AsyncContent>

      <Modal
        open={Boolean(editing)}
        title={editing?.complaint ? 'تعديل الشكوى' : 'تسجيل شكوى جديدة'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <RecordForm
            key={editing.complaint?.id ?? 'new'}
            fields={COMPLAINT_FIELDS}
            initial={editing.complaint || { kind: 'complaint' }}
            submitLabel={editing.complaint ? 'حفظ التعديلات' : 'تسجيل الشكوى'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message="هل أنت متأكد من حذف هذه الشكوى؟"
        details={deletion.target ? `${deletion.target.kind_display}: ${deletion.target.name} — ${deletion.target.category}` : ''}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
