import { useMemo, useState } from 'react'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { EditIcon, HomeIcon, TrashIcon } from '../components/Icons'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import RecordForm from '../components/RecordForm'
import SearchInput from '../components/SearchInput'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import usePagedList from '../hooks/usePagedList'
import { committeesApi } from '../services/api'

const PAGE_SIZE = 50

const FIELDS = [
  { name: 'name', label: 'الاسم', required: true, maxLength: 150, third: true },
  { name: 'committee', label: 'اسم اللجنة', required: true, maxLength: 200, third: true, placeholder: 'مثال: لجنة حي الزيتون' },
  { name: 'phone', label: 'رقم الجوال', maxLength: 16, numeric: true, inputMode: 'tel', third: true, placeholder: '0599123456' },
]

const COLUMNS = 'sm:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.5fr)_9rem_auto]'

/** «لجان الأحياء»: the neighborhood committees' representatives, searchable, with add / edit / delete. */
export default function CommitteesPage() {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('committees.edit')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // { rep | null }
  const debounced = useDebouncedValue(search)

  const params = useMemo(() => {
    const p = { page, page_size: PAGE_SIZE }
    if (debounced.trim()) p.search = debounced.trim()
    return p
  }, [page, debounced])
  const { data, loading, error, reload } = usePagedList(committeesApi.list, params)

  const deletion = useConfirmAction((rep) => committeesApi.remove(rep.id), {
    success: 'تم حذف الممثل.',
    fallback: 'تعذر الحذف.',
    onDone: reload,
  })

  async function save(payload) {
    if (editing.rep) {
      await committeesApi.update(editing.rep.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await committeesApi.create(payload)
      toast.success('تمت إضافة الممثل.')
    }
    setEditing(null)
    reload()
  }

  const addButton = canEdit ? <AddButton onClick={() => setEditing({ rep: null })}>إضافة ممثل</AddButton> : null
  const offset = (page - 1) * PAGE_SIZE

  return (
    <div>
      <PageHeader title="لجان الأحياء" subtitle="ممثلو لجان الأحياء وأرقام التواصل معهم.">
        {addButton}
      </PageHeader>

      <SearchInput
        className="mb-4"
        label="البحث في لجان الأحياء"
        placeholder="ابحث بالاسم أو اسم اللجنة أو رقم الجوال…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />

      <AsyncContent
        loading={loading}
        error={error}
        onRetry={reload}
        isEmpty={!data.results.length}
        empty={
          <EmptyState icon={HomeIcon} title={debounced.trim() ? 'لا توجد نتائج مطابقة' : 'لا يوجد ممثلون بعد'} action={addButton} />
        }
      >
        <div className="card overflow-hidden">
          <div className={`hidden gap-4 border-b border-line bg-canvas px-5 py-2.5 text-xs font-semibold text-muted sm:grid ${COLUMNS}`}>
            <span>#</span>
            <span>الاسم</span>
            <span>اسم اللجنة</span>
            <span>رقم الجوال</span>
            <span className="w-[4.5rem]" />
          </div>
          <ul className="divide-y divide-line">
            {data.results.map((rep, i) => (
              <li key={rep.id} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas/60 sm:grid sm:gap-4 ${COLUMNS}`}>
                <span className="num w-6 shrink-0 text-sm text-muted">{offset + i + 1}</span>
                {/* stacked on a phone, one column each on a wider screen */}
                <div className="min-w-0 flex-1 sm:contents">
                  <span className="block font-semibold text-ink">{rep.name}</span>
                  <span className="block text-sm text-muted sm:text-[0.95rem] sm:text-ink">{rep.committee}</span>
                  <span className="mt-0.5 block sm:mt-0">
                    {rep.phone ? (
                      <a href={`tel:${rep.phone}`} className="num font-semibold text-brand-700 hover:underline">
                        {rep.phone}
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </span>
                </div>
                <span className="flex w-[4.5rem] shrink-0 justify-end gap-0.5">
                  {canEdit && (
                    <>
                      <button type="button" className="icon-action" aria-label={`تعديل ${rep.name}`} title="تعديل" onClick={() => setEditing({ rep })}>
                        <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                      </button>
                      <button type="button" className="icon-action icon-action-danger" aria-label={`حذف ${rep.name}`} title="حذف" onClick={() => deletion.ask(rep)}>
                        <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
      </AsyncContent>

      <Modal size="form" open={Boolean(editing)} title={editing?.rep ? 'تعديل بيانات الممثل' : 'إضافة ممثل لجنة حي'} onClose={() => setEditing(null)}>
        {editing && (
          <RecordForm
            key={editing.rep?.id ?? 'new'}
            fields={FIELDS}
            initial={editing.rep || {}}
            submitLabel={editing.rep ? 'حفظ التعديلات' : 'إضافة الممثل'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message="هل أنت متأكد من حذف هذا الممثل؟"
        details={deletion.target ? `${deletion.target.name}، ${deletion.target.committee}` : ''}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
