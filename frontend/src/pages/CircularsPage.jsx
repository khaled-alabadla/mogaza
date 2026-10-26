import { useMemo, useState } from 'react'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { EditIcon, MegaphoneIcon, PinIcon, TrashIcon } from '../components/Icons'
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
import { circularsApi } from '../services/api'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 20

const FIELDS = [
  { name: 'title', label: 'العنوان', required: true, maxLength: 200, placeholder: 'مثال: أعمدة الكهرباء وإزالتها من الشوارع' },
  {
    name: 'body',
    label: 'نص التعميم',
    required: true,
    maxLength: 5000,
    multiline: true,
    rows: 7,
    placeholder: 'ماذا يُقال للمواطن، وإلى أين يُوجَّه، وأرقام التواصل…',
  },
  { name: 'pinned', label: 'تثبيت التعميم في أعلى الصفحة', type: 'checkbox' },
]

const PHONE = /(0\d{8,9})/

/** The circular's text, line breaks kept, phone numbers as «call» links. */
function Body({ text }) {
  return (
    <p className="text-[0.95rem] leading-8 whitespace-pre-line text-ink">
      {text.split(PHONE).map((part, i) =>
        i % 2 ? (
          <a key={i} href={`tel:${part}`} className="num font-semibold text-brand-700 hover:underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  )
}

/** «تعميمات»: the department's instructions for answering citizens; pinned ones first, then the latest. */
export default function CircularsPage() {
  const toast = useToast()
  const { can } = useAuth()
  const canEdit = can('circulars.edit')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // { circular | null }
  const debounced = useDebouncedValue(search)

  const params = useMemo(() => {
    const p = { page, page_size: PAGE_SIZE }
    if (debounced.trim()) p.search = debounced.trim()
    return p
  }, [page, debounced])
  const { data, loading, error, reload } = usePagedList(circularsApi.list, params)

  const deletion = useConfirmAction((c) => circularsApi.remove(c.id), {
    success: 'تم حذف التعميم.',
    fallback: 'تعذر الحذف.',
    onDone: reload,
  })

  async function save(payload) {
    if (editing.circular) {
      await circularsApi.update(editing.circular.id, payload)
      toast.success('تم حفظ التعديلات.')
    } else {
      await circularsApi.create(payload)
      toast.success('تمت إضافة التعميم.')
    }
    setEditing(null)
    reload()
  }

  const addButton = canEdit ? <AddButton onClick={() => setEditing({ circular: null })}>إضافة تعميم</AddButton> : null

  return (
    <div>
      <PageHeader title="تعميمات" subtitle="توجيهات القسم للرد على استفسارات المواطنين.">
        {addButton}
      </PageHeader>

      <SearchInput
        className="mb-4"
        label="البحث في التعميمات"
        placeholder="ابحث في عناوين التعميمات ونصوصها…"
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
        empty={<EmptyState icon={MegaphoneIcon} title={debounced.trim() ? 'لا توجد نتائج مطابقة' : 'لا توجد تعميمات بعد'} action={addButton} />}
      >
        <ul className="space-y-3">
          {data.results.map((c) => (
            <li key={c.id} className={`card relative overflow-hidden p-4 sm:p-5 ${c.pinned ? 'ring-1 ring-gold-400/50' : ''}`}>
              {c.pinned && <span className="absolute inset-y-0 start-0 w-1 bg-gold-400" aria-hidden="true" />}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-[1.05rem] font-bold text-ink">
                    {c.title}
                    {c.pinned && (
                      <span className="badge bg-gold-100 text-gold-700">
                        <PinIcon className="h-3.5 w-3.5" /> مثبّت
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">آخر تحديث {formatDateTime(c.updated_at)}</p>
                </div>
                {canEdit && (
                  <div className="-mt-1 -me-1 flex shrink-0 gap-0.5">
                    <button type="button" className="icon-action" aria-label={`تعديل ${c.title}`} title="تعديل" onClick={() => setEditing({ circular: c })}>
                      <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                    </button>
                    <button type="button" className="icon-action icon-action-danger" aria-label={`حذف ${c.title}`} title="حذف" onClick={() => deletion.ask(c)}>
                      <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <Body text={c.body} />
              </div>
            </li>
          ))}
        </ul>
        <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />
      </AsyncContent>

      <Modal size="form" open={Boolean(editing)} title={editing?.circular ? 'تعديل التعميم' : 'إضافة تعميم'} onClose={() => setEditing(null)}>
        {editing && (
          <RecordForm
            key={editing.circular?.id ?? 'new'}
            fields={FIELDS}
            initial={editing.circular || {}}
            submitLabel={editing.circular ? 'حفظ التعديلات' : 'إضافة التعميم'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletion.target)}
        message="هل أنت متأكد من حذف هذا التعميم؟"
        details={deletion.target?.title || ''}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
