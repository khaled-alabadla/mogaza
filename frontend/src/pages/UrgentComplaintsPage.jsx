import { useMemo, useState } from 'react'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { AlertIcon, CheckIcon, EditIcon, RestoreIcon, SheetIcon, TrashIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import SearchInput from '../components/SearchInput'
import Segmented from '../components/Segmented'
import { useAuth } from '../context/AuthContext'
import { useText } from '../context/ContentContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { urgentApi } from '../services/api'
import { parseApiError } from '../utils/errors'

const PAGE_SIZE = 25

const STATUS_TABS = [
  { value: 'unresolved', label: 'لم يتم الحل' },
  { value: 'resolved', label: 'تم الحل' },
  { value: '', label: 'الكل' },
]

/** The form (three to a row on wide screens). «مقدمة منذ» is typed in days; the server keeps the date. */
const FIELDS = [
  { name: 'number', label: 'رقم الشكوى', maxLength: 50, numeric: true, inputMode: 'numeric', third: true },
  { name: 'name', label: 'اسم مقدم الشكوى', maxLength: 150, third: true },
  { name: 'category', label: 'نوع الشكوى', maxLength: 150, third: true },
  { name: 'phone', label: 'رقم الجوال', maxLength: 16, numeric: true, inputMode: 'tel', third: true, placeholder: '0599123456' },
  { name: 'submitted_days_ago', label: 'مقدمة منذ (يوم)', maxLength: 4, numeric: true, inputMode: 'numeric', third: true, placeholder: '3' },
  { name: 'notes', label: 'ملاحظات', maxLength: 3000, multiline: true, rows: 3 },
]

/** «منذ 3 أيام» with Arabic number agreement. */
export function ageText(days) {
  if (days === null || days === undefined) return '—'
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'منذ يوم'
  if (days === 2) return 'منذ يومين'
  if (days <= 10) return `منذ ${days} أيام`
  return `منذ ${days} يوماً`
}

/** The older the complaint, the warmer its colour (a week or more is red). */
function ageTone(days) {
  if (days === null || days === undefined) return 'bg-gray-100 text-muted'
  if (days >= 7) return 'bg-danger-50 text-danger-700 ring-1 ring-danger-100'
  if (days >= 3) return 'bg-gold-100 text-gold-700 ring-1 ring-gold-400/40'
  return 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
}

const toDays = (value) => {
  const digits = String(value ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim()
  return digits === '' ? null : Number(digits)
}

function Detail({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[0.95rem] font-semibold text-ink">{children || <span className="font-normal text-gray-300">—</span>}</dd>
    </div>
  )
}

/** One urgent complaint: all its fields in a grid, its notes under them, the actions at the end. */
function UrgentRow({ item, canEdit, onToggle, onEdit, onDelete }) {
  const resolved = item.status === 'resolved'
  return (
    <li className="card relative overflow-hidden transition-shadow hover:shadow-md">
      <span className={`absolute inset-y-0 start-0 w-1 ${resolved ? 'bg-brand-500' : 'bg-danger-600'}`} aria-hidden="true" />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
        <Detail label="رقم الشكوى">{item.number && <span className="num">{item.number}</span>}</Detail>
        <Detail label="اسم مقدم الشكوى">{item.name}</Detail>
        <Detail label="نوع الشكوى">{item.category}</Detail>
        <Detail label="رقم الجوال">
          {item.phone && (
            <a href={`tel:${item.phone}`} className="num hover:text-brand-700 hover:underline">
              {item.phone}
            </a>
          )}
        </Detail>
        <Detail label="مقدمة منذ">
          {item.age_days !== null && item.age_days !== undefined && (
            <span className={`badge text-[0.8rem] ${resolved ? 'bg-gray-100 text-muted' : ageTone(item.age_days)}`}>{ageText(item.age_days)}</span>
          )}
        </Detail>
        {item.notes && (
          <div className="col-span-full">
            <dt className="text-xs text-muted">ملاحظات</dt>
            <dd className="mt-1 rounded-lg bg-canvas px-3 py-2 text-sm leading-7 whitespace-pre-line text-ink">{item.notes}</dd>
          </div>
        )}
      </dl>

      {(canEdit || resolved) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 sm:px-5">
          <div>
            {resolved && <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-100">تم الحل</span>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`btn me-1 py-1.5 ${resolved ? 'btn-secondary' : 'border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100'}`}
                onClick={() => onToggle(item, !resolved)}
              >
                {resolved ? <RestoreIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
                {resolved ? 'إرجاع إلى «لم يتم الحل»' : 'تم الحل'}
              </button>
              <button type="button" className="icon-action" aria-label="تعديل" title="تعديل" onClick={() => onEdit(item)}>
                <EditIcon className="h-[1.1rem] w-[1.1rem]" />
              </button>
              <button type="button" className="icon-action icon-action-danger" aria-label="حذف" title="حذف" onClick={() => onDelete(item)}>
                <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** «الشكاوى العاجلة»: complaints followed up until they are resolved (oldest first). */
export default function UrgentComplaintsPage() {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('urgent.edit')
  const canExport = can('urgent.export')
  const title = useText('urgent.title') || 'الشكاوى العاجلة'
  const subtitle = useText('urgent.subtitle')
  const [tab, setTab] = useState('unresolved')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // { item | null }
  const debounced = useDebouncedValue(search)

  const filters = useMemo(() => {
    const f = {}
    if (tab) f.status = tab
    if (debounced.trim()) f.search = debounced.trim()
    return f
  }, [tab, debounced])
  const params = useMemo(() => ({ ...filters, page, page_size: PAGE_SIZE }), [filters, page])
  const { data, loading, error, reload } = usePagedList(urgentApi.list, params)

  const changeFilter = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const deletion = useConfirmAction((item) => urgentApi.remove(item.id), {
    success: 'تم حذف الشكوى.',
    fallback: 'تعذر الحذف.',
    onDone: reload,
  })

  async function save(payload) {
    const body = { ...payload, submitted_days_ago: toDays(payload.submitted_days_ago) }
    if (editing.item) {
      await urgentApi.update(editing.item.id, body)
      toast.success('تم حفظ التعديلات.')
    } else {
      await urgentApi.create(body)
      toast.success('تمت إضافة الشكوى العاجلة.')
    }
    setEditing(null)
    reload()
  }

  async function toggleResolved(item, resolved) {
    try {
      await urgentApi.markResolved([item.id], resolved)
      toast.success(resolved ? 'تم تعليم الشكوى «تم الحل».' : 'أُعيدت الشكوى إلى «لم يتم الحل».')
      reload()
    } catch (err) {
      toast.error(parseApiError(err, 'تعذر تحديث الحالة.').message)
    }
  }

  const openAdd = () => setEditing({ item: null })
  const addButton = canEdit ? <AddButton onClick={openAdd}>إضافة شكوى عاجلة</AddButton> : null
  const searching = Boolean(debounced.trim())
  const initial = editing?.item ? { ...editing.item, submitted_days_ago: editing.item.age_days ?? '' } : {}

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}>
        {canExport && (
          <a className="btn btn-secondary" href={urgentApi.exportUrl(filters)}>
            <SheetIcon className="h-4 w-4" /> تصدير Excel
          </a>
        )}
        {addButton}
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          className="shrink-0 self-start"
          label="حالة الشكوى"
          value={tab}
          onChange={(value) => changeFilter(setTab)(value)}
          options={STATUS_TABS.map((t) => ({ ...t, badge: t.value === 'unresolved' ? data.unresolved_count : 0 }))}
        />
        <SearchInput
          className="flex-1"
          label="البحث في الشكاوى العاجلة"
          placeholder="ابحث برقم الشكوى أو الاسم أو الجوال أو النوع…"
          value={search}
          onChange={(e) => changeFilter(setSearch)(e.target.value)}
        />
      </div>

      <AsyncContent
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={!data.results.length}
        empty={
          <EmptyState
            icon={AlertIcon}
            title={searching ? 'لا توجد نتائج مطابقة' : tab === 'unresolved' ? 'لا توجد شكاوى عاجلة بانتظار الحل' : 'لا توجد شكاوى'}
            action={addButton}
          />
        }
      >
        <ul className="space-y-2.5">
          {data.results.map((item) => (
            <UrgentRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onToggle={toggleResolved}
              onEdit={(i) => setEditing({ item: i })}
              onDelete={deletion.ask}
            />
          ))}
        </ul>
        <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
      </AsyncContent>

      <Modal size="form" open={Boolean(editing)} title={editing?.item ? 'تعديل الشكوى العاجلة' : 'إضافة شكوى عاجلة'} onClose={() => setEditing(null)}>
        {editing && (
          <RecordForm
            key={editing.item?.id ?? 'new'}
            fields={FIELDS}
            initial={initial}
            submitLabel={editing.item ? 'حفظ التعديلات' : 'إضافة الشكوى'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message="هل أنت متأكد من حذف هذه الشكوى العاجلة؟"
        details={deletion.target ? [deletion.target.number, deletion.target.name].filter(Boolean).join(' — ') : ''}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
