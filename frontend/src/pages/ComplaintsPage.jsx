import { useEffect, useMemo, useState } from 'react'
import { AddButton, DeleteButton, EditButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { CheckIcon, DownloadIcon, RestoreIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import { complaintFields } from '../components/recordFields'
import SearchInput from '../components/SearchInput'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { complaintsApi, neighborhoodsApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 20

/** Complaints and inquiries are separate, like locations and streets on the search page. */
const KINDS = {
  complaint: {
    tab: 'الشكاوى',
    add: 'إضافة شكوى',
    addTitle: 'إضافة شكوى جديدة',
    editTitle: 'تعديل الشكوى',
    created: 'تمت إضافة الشكوى.',
    deleted: 'تم حذف الشكوى.',
    deleteMessage: 'هل أنت متأكد من حذف هذه الشكوى؟',
    pendingEmpty: 'لا توجد شكاوى بانتظار الرفع',
    empty: 'لا توجد شكاوى',
  },
  inquiry: {
    tab: 'الاستفسارات',
    add: 'إضافة استفسار',
    addTitle: 'إضافة استفسار جديد',
    editTitle: 'تعديل الاستفسار',
    created: 'تمت إضافة الاستفسار.',
    deleted: 'تم حذف الاستفسار.',
    deleteMessage: 'هل أنت متأكد من حذف هذا الاستفسار؟',
    pendingEmpty: 'لا توجد استفسارات بانتظار الرفع',
    empty: 'لا توجد استفسارات',
  },
}

const UPLOAD_TABS = [
  { value: 'pending', label: 'بانتظار الرفع' },
  { value: 'uploaded', label: 'تم الرفع' },
  { value: '', label: 'الكل' },
]

const STATUS_TONES = { pending: 'bg-gold-100 text-gold-700', uploaded: 'bg-brand-50 text-brand-700' }
// Shown in the card header / text block rather than in the details grid
const OWN_PLACE = new Set(['hide_identity', 'category', 'details'])
const LTR_FIELDS = new Set(['national_id', 'phone', 'point', 'building_number', 'street_number', 'subscription'])

function Detail({ label, value, name }) {
  const shown =
    name === 'phone' ? (
      <a href={`tel:${value}`} className="hover:text-brand-700 hover:underline">
        {value}
      </a>
    ) : (
      value
    )
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      {/* numbers keep their LTR order (isolated span) but stay right-aligned like the Arabic values */}
      <dd className="truncate text-sm font-medium text-ink">{LTR_FIELDS.has(name) ? <span className="num">{shown}</span> : shown}</dd>
    </div>
  )
}

function ComplaintCard({ complaint: c, fields, selected, onSelect, onToggleUploaded, onEdit, onDelete }) {
  const uploaded = c.status === 'uploaded'
  const details = fields.filter((f) => !OWN_PLACE.has(f.name) && c[f.name])
  return (
    <li className={`card p-4 transition-colors sm:p-5 ${selected ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
      <div className="flex items-start gap-3">
        <label className="tap -m-2 flex shrink-0 cursor-pointer items-start justify-center p-2">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-brand-600"
            checked={selected}
            onChange={(e) => onSelect(c.id, e.target.checked)}
            aria-label={`تحديد ${c.kind_display} ${c.name || c.category || c.id}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink">{c.category || `${c.kind_display} بدون تصنيف`}</h3>
            <span className={`badge ${STATUS_TONES[c.status]}`}>{c.status_display}</span>
            {c.hide_identity && <span className="badge bg-gray-100 text-muted">بيانات صاحب الشكوى مخفية</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            سُجّل {formatDateTime(c.created_at)}
            {c.created_by_name && ` بواسطة ${c.created_by_name}`}
            {uploaded && c.uploaded_at && ` · رُفع ${formatDateTime(c.uploaded_at)}`}
          </p>

          {details.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {details.map((f) => (
                // a choice (e.g. «المصدر») shows its Arabic label
                <Detail key={f.name} name={f.name} label={f.label} value={f.type === 'select' ? c[`${f.name}_display`] : c[f.name]} />
              ))}
            </dl>
          )}

          {c.details && (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2.5 text-sm whitespace-pre-line text-ink">{c.details}</p>
          )}

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

/** «الشكاوى المؤقتة»: complaints and inquiries recorded while the main system is down, then marked as uploaded. */
export default function ComplaintsPage() {
  const toast = useToast()
  const [kind, setKind] = useState('complaint')
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // { complaint | null }
  const [neighborhoodNames, setNeighborhoodNames] = useState([])
  const debounced = useDebouncedValue(search)
  const k = KINDS[kind]

  // «الحي / المنطقة» suggests the known neighborhoods (any other text is still accepted)
  useEffect(() => {
    const controller = new AbortController()
    neighborhoodsApi
      .list(undefined, controller.signal)
      .then((list) => setNeighborhoodNames((Array.isArray(list) ? list : list.results || []).map((n) => n.name)))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const fields = useMemo(() => complaintFields(kind, neighborhoodNames), [kind, neighborhoodNames])

  const filters = useMemo(
    () => ({ kind, upload: tab || undefined, search: debounced.trim() || undefined }),
    [kind, tab, debounced],
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
    success: k.deleted,
    fallback: 'تعذر الحذف.',
    onDone: refresh,
  })

  async function save(payload) {
    if (editing.complaint) {
      await complaintsApi.update(editing.complaint.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await complaintsApi.create({ ...payload, kind })
      toast.success(k.created)
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
  const openAdd = () => setEditing({ complaint: null })
  const searching = Boolean(debounced.trim())

  return (
    <div>
      <PageHeader
        title="الشكاوى المؤقتة"
        subtitle="سجّل الشكاوى والاستفسارات أثناء تعطل النظام الرئيسي، ثم علّمها «تم الرفع» بعد إدخالها إليه."
      >
        <a className="btn btn-secondary" href={exportHref}>
          <DownloadIcon className="h-4 w-4" /> تصدير Excel
        </a>
        <AddButton onClick={openAdd}>{k.add}</AddButton>
      </PageHeader>

      <div className="mb-4 inline-flex rounded-xl border border-line bg-white p-1" role="tablist" aria-label="نوع الطلب">
        {Object.entries(KINDS).map(([value, kd]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => changeFilter(setKind)(value)}
            className={`tap rounded-lg px-5 py-2 text-sm font-bold transition-colors ${
              kind === value ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {kd.tab}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="inline-flex shrink-0 self-start rounded-xl border border-line bg-white p-1" role="tablist" aria-label="حالة الرفع">
          {UPLOAD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => changeFilter(setTab)(t.value)}
              className={`tap flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.value ? 'bg-gold-100 text-gold-700' : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
              {t.value === 'pending' && data.pending_count > 0 && (
                <span className="num rounded-full bg-gold-400 px-1.5 text-xs text-ink">{data.pending_count}</span>
              )}
            </button>
          ))}
        </div>
        <SearchInput
          className="flex-1"
          label="البحث في الشكاوى والاستفسارات"
          placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو النوع أو النص…"
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
            title={searching ? 'لا توجد نتائج مطابقة' : tab === 'pending' ? k.pendingEmpty : k.empty}
            hint={tab === 'pending' && !searching ? 'كل ما سُجّل تم رفعه إلى النظام الرئيسي.' : undefined}
            action={<AddButton onClick={openAdd}>{k.add}</AddButton>}
          />
        }
      >
        <ul className="space-y-3">
          {data.results.map((c) => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              fields={fields}
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

      <Modal open={Boolean(editing)} title={editing?.complaint ? k.editTitle : k.addTitle} onClose={() => setEditing(null)}>
        {editing && (
          <RecordForm
            key={editing.complaint?.id ?? `new-${kind}`}
            fields={fields}
            initial={editing.complaint || {}}
            submitLabel={editing.complaint ? 'حفظ التعديلات' : k.add}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message={k.deleteMessage}
        details={
          deletion.target
            ? [deletion.target.name, deletion.target.category].filter(Boolean).join(' — ')
            : ''
        }
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
