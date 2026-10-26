import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { CheckIcon, EditIcon, PrintIcon, RestoreIcon, SheetIcon, TrashIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import { complaintFields } from '../components/recordFields'
import SearchInput from '../components/SearchInput'
import Segmented from '../components/Segmented'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { complaintsApi, neighborhoodsApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import { filterParams, KINDS, UPLOAD_TABS } from './complaintKinds'
import { useText } from '../context/ContentContext'

const PAGE_SIZE = 20

const STATUS_TONES = { pending: 'bg-gold-100 text-gold-700 ring-1 ring-gold-400/40', uploaded: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' }
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

function ComplaintCard({ complaint: c, fields, canEdit, selected, onSelect, onToggleUploaded, onEdit, onDelete }) {
  const uploaded = c.status === 'uploaded'
  const details = fields.filter((f) => !OWN_PLACE.has(f.name) && c[f.name])
  return (
    <li className={`card card-lift relative overflow-hidden p-4 sm:p-5 ${selected ? 'border-brand-500 ring-2 ring-brand-100' : ''}`}>
      {/* status edge: gold while waiting, green once uploaded */}
      <span className={`absolute inset-y-0 start-0 w-1 ${uploaded ? 'bg-brand-500' : 'bg-gold-400'}`} aria-hidden="true" />
      <div className="flex items-start gap-3">
        {canEdit && (
          <label className="tap -m-2 flex shrink-0 cursor-pointer items-start justify-center p-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-brand-600"
              checked={selected}
              onChange={(e) => onSelect(c.id, e.target.checked)}
              aria-label={`تحديد ${c.kind_display} ${c.name || c.category || c.id}`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[1.05rem] font-bold text-ink">{c.category || `${c.kind_display} بدون تصنيف`}</h3>
                <span className={`badge ${STATUS_TONES[c.status]}`}>{c.status_display}</span>
                {c.hide_identity && <span className="badge bg-gray-100 text-muted ring-1 ring-line">بيانات صاحب الشكوى مخفية</span>}
              </div>
              <p className="mt-1 text-xs text-muted">
                سُجّل {formatDateTime(c.created_at)}
                {c.created_by_name && ` بواسطة ${c.created_by_name}`}
                {uploaded && c.uploaded_at && ` · رُفع ${formatDateTime(c.uploaded_at)}`}
              </p>
            </div>
            {canEdit && (
              <div className="-mt-1 -me-1 flex shrink-0 gap-0.5">
                <button type="button" className="icon-action" aria-label="تعديل" title="تعديل" onClick={() => onEdit(c)}>
                  <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                </button>
                <button type="button" className="icon-action icon-action-danger" aria-label="حذف" title="حذف" onClick={() => onDelete(c)}>
                  <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                </button>
              </div>
            )}
          </div>

          {details.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              {details.map((f) => (
                // a choice (e.g. «المصدر») shows its Arabic label; «الحي» is stored as its name
                <Detail
                  key={f.name}
                  name={f.name}
                  label={f.label}
                  value={(f.type === 'select' && c[`${f.name}_display`]) || c[f.name]}
                />
              ))}
            </dl>
          )}

          {c.details && (
            <p className="mt-3 border-s-2 border-gold-400 ps-3 text-sm leading-7 whitespace-pre-line text-ink">{c.details}</p>
          )}

          {canEdit && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={`btn py-2 ${uploaded ? 'btn-secondary' : 'border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100'}`}
                onClick={() => onToggleUploaded([c.id], !uploaded)}
              >
                {uploaded ? <RestoreIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
                {uploaded ? 'إرجاع إلى بانتظار الرفع' : 'تم الرفع'}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * One log («الشكاوى» or «الاستفسارات»): records taken while the main system is down, then marked
 * as uploaded. Adding / editing / marking needs `<kind>.edit`, the Excel / PDF exports `<kind>.export`.
 */
export function ComplaintsLog({ kind }) {
  const toast = useToast()
  const { can } = useAuth()
  const k = KINDS[kind]
  const canEdit = can(`${k.perm}.edit`)
  const canExport = can(`${k.perm}.export`)
  const pageTitle = useText(`${k.perm}.title`) || k.title
  const pageSubtitle = useText(`${k.perm}.subtitle`)
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // { complaint | null }
  const [neighborhoodNames, setNeighborhoodNames] = useState([])
  const debounced = useDebouncedValue(search)

  // the inquiry «الحي» select lists the known neighborhoods (only needed by the form)
  const needNeighborhoods = kind === 'inquiry' && canEdit
  useEffect(() => {
    if (!needNeighborhoods) return undefined
    const controller = new AbortController()
    neighborhoodsApi
      .list(undefined, controller.signal)
      .then((list) => setNeighborhoodNames((Array.isArray(list) ? list : list.results || []).map((n) => n.name)))
      .catch(() => {})
    return () => controller.abort()
  }, [needNeighborhoods])
  const fields = useMemo(() => complaintFields(kind, neighborhoodNames), [kind, neighborhoodNames])
  const formFields = useMemo(
    () => complaintFields(kind, neighborhoodNames, editing?.complaint?.area),
    [kind, neighborhoodNames, editing],
  )

  const filters = useMemo(() => filterParams(kind, tab, debounced.trim()), [kind, tab, debounced])
  const params = useMemo(() => ({ ...filters, page, page_size: PAGE_SIZE }), [filters, page])
  // both exports use the same filters as the list (every page)
  const exportHref = complaintsApi.exportUrl(filters)
  const reportParams = new URLSearchParams(filters)
  reportParams.delete('kind') // the report's path already says which log it is
  const reportQuery = reportParams.toString()
  const reportHref = `${k.path}/report${reportQuery ? `?${reportQuery}` : ''}`
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
  const addButton = canEdit ? <AddButton onClick={openAdd}>{k.add}</AddButton> : null

  return (
    <div>
      <PageHeader title={pageTitle} subtitle={pageSubtitle}>
        {canExport && (
          <>
            <a className="btn btn-secondary" href={exportHref}>
              <SheetIcon className="h-4 w-4" /> تصدير Excel
            </a>
            <Link className="btn btn-secondary" to={reportHref}>
              <PrintIcon className="h-4 w-4" /> تصدير PDF
            </Link>
          </>
        )}
        {addButton}
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          className="shrink-0 self-start"
          label="حالة الرفع"
          value={tab}
          onChange={(value) => changeFilter(setTab)(value)}
          options={UPLOAD_TABS.map((t) => ({ ...t, badge: t.value === 'pending' ? data.pending_count : 0 }))}
        />
        <SearchInput
          className="flex-1"
          label={k.searchLabel}
          placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو النوع أو النص…"
          value={search}
          onChange={(e) => changeFilter(setSearch)(e.target.value)}
        />
      </div>

      {canEdit && data.results.length > 0 && (
        <div
          className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 transition-colors ${
            selected.size ? 'border-brand-500/40 bg-brand-50' : 'border-line bg-white'
          }`}
        >
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
            action={addButton}
          />
        }
      >
        <ul className="stagger space-y-2.5">
          {data.results.map((c) => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              fields={fields}
              canEdit={canEdit}
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

      <Modal size="form" open={Boolean(editing)} title={editing?.complaint ? k.editTitle : k.addTitle} onClose={() => setEditing(null)}>
        {editing && (
          <RecordForm
            key={editing.complaint?.id ?? `new-${kind}`}
            fields={formFields}
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
            ? [deletion.target.name, deletion.target.category].filter(Boolean).join('، ')
            : ''
        }
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}

/** «الشكاوى» */
export default function ComplaintsPage() {
  return <ComplaintsLog kind="complaint" />
}
