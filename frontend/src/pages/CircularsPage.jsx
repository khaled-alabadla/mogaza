import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { CalendarIcon, CheckIcon, ChevronDownIcon, CopyIcon, EditIcon, MegaphoneIcon, PinIcon, TrashIcon } from '../components/Icons'
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
import { copyText } from '../utils/clipboard'

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

/** Marks the searched words inside a piece of text. */
function Highlight({ text, terms }) {
  if (!terms.length) return text
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return text.split(pattern).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded bg-gold-100 px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** The circular's text, line breaks kept, phone numbers as «call» links, searched words marked. */
function Body({ text, terms, clamped }) {
  return (
    <p className={`text-[0.95rem] leading-8 whitespace-pre-line text-ink ${clamped ? 'line-clamp-5' : ''}`}>
      {text.split(PHONE).map((part, i) =>
        i % 2 ? (
          <a
            key={i}
            href={`tel:${part}`}
            className="num mx-0.5 inline-block rounded-md bg-white px-1.5 font-semibold leading-7 text-brand-700 ring-1 ring-brand-100 transition-colors hover:bg-brand-50"
          >
            {part}
          </a>
        ) : (
          <Highlight key={i} text={part} terms={terms} />
        ),
      )}
    </p>
  )
}

/** «اليوم» / «أمس» / «منذ 3 أيام», then the date itself after ten days. */
function whenUpdated(value) {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(value).setHours(0, 0, 0, 0)) / 86400000)
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days === 2) return 'منذ يومين'
  if (days <= 10) return `منذ ${days} أيام`
  return formatDateTime(value)
}

/** «نسخ النص»: the circular, ready to paste in a reply to the citizen. */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked: the text stays selectable
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="tap inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
    >
      {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      {copied ? 'تم النسخ' : 'نسخ النص'}
    </button>
  )
}

const LONG_TEXT = 420

/** One circular: icon, title, the text in a soft box, and a footer with its date and «نسخ النص». */
function CircularCard({ circular: c, terms, canEdit, onEdit, onDelete, focused }) {
  const long = c.body.length > LONG_TEXT || c.body.split('\n').length > 6
  const [expanded, setExpanded] = useState(Boolean(focused)) // opened from the home page: shown in full
  return (
    <li
      id={`circular-${c.id}`}
      aria-current={focused ? 'true' : undefined}
      className={`card card-lift relative scroll-mt-24 overflow-hidden ${c.pinned ? 'border-gold-400/60' : ''} ${focused ? 'ring-2 ring-brand-500' : ''}`}
    >
      {c.pinned && <span className="absolute inset-x-0 top-0 h-1 bg-gold-400" aria-hidden="true" />}
      <div className="flex items-start gap-3.5 p-4 sm:p-5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
            c.pinned ? 'bg-gold-100 text-gold-700 ring-gold-400/40' : 'bg-brand-50 text-brand-700 ring-brand-100'
          }`}
          aria-hidden="true"
        >
          {c.pinned ? <PinIcon className="h-5 w-5" /> : <MegaphoneIcon className="h-5 w-5" />}
        </span>
        <h2 className="flex min-w-0 flex-1 flex-wrap items-center gap-2 self-center text-[1.05rem] leading-snug font-bold text-ink">
          <Highlight text={c.title} terms={terms} />
          {c.pinned && <span className="badge bg-gold-100 text-gold-700">مثبّت</span>}
        </h2>
        {canEdit && (
          <div className="-mt-1 -me-1 flex shrink-0 gap-0.5">
            <button type="button" className="icon-action" aria-label={`تعديل ${c.title}`} title="تعديل" onClick={onEdit}>
              <EditIcon className="h-[1.1rem] w-[1.1rem]" />
            </button>
            <button type="button" className="icon-action icon-action-danger" aria-label={`حذف ${c.title}`} title="حذف" onClick={onDelete}>
              <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
            </button>
          </div>
        )}
      </div>
      <div className="mx-4 rounded-xl bg-canvas px-4 py-3 sm:ms-[4.75rem] sm:me-5">
        <Body text={c.body} terms={terms} clamped={long && !expanded} />
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            {expanded ? 'عرض أقل' : 'عرض النص كاملاً'}
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:ms-[4.75rem] sm:ps-0 sm:pe-5">
        <p className="flex items-center gap-1.5 text-xs text-muted" title={formatDateTime(c.updated_at)}>
          <CalendarIcon className="h-3.5 w-3.5" />
          آخر تحديث: {whenUpdated(c.updated_at)}
        </p>
        <CopyButton text={`${c.title}\n${c.body}`} />
      </div>
    </li>
  )
}

/** A small heading above a group of circulars, with how many are in it. */
function GroupTitle({ icon: Icon, children, count }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-muted">
      <Icon className="h-4 w-4" />
      {children}
      <span className="num rounded-full bg-white px-2 text-xs leading-5 ring-1 ring-line">{count}</span>
    </h3>
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
  // «/circulars?open=5» (a circular clicked on the home page): bring it into view, marked
  const [searchParams] = useSearchParams()
  const focusId = Number(searchParams.get('open')) || null
  useEffect(() => {
    if (focusId && !loading) document.getElementById(`circular-${focusId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [focusId, loading])

  const pinned = data.results.filter((c) => c.pinned)
  const rest = data.results.filter((c) => !c.pinned)
  const terms = debounced.trim().split(/\s+/).filter((t) => t.length > 1)

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
        <div className="space-y-6">
          {[
            { key: 'pinned', items: pinned, title: 'تعميمات مثبّتة', icon: PinIcon },
            { key: 'rest', items: rest, title: pinned.length ? 'باقي التعميمات' : 'كل التعميمات', icon: MegaphoneIcon },
          ]
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key} aria-label={g.title}>
                <GroupTitle icon={g.icon} count={g.items.length}>
                  {g.title}
                </GroupTitle>
                <ul className="stagger space-y-3">
                  {g.items.map((c) => (
                    <CircularCard
                      key={c.id}
                      circular={c}
                      focused={c.id === focusId}
                      terms={terms}
                      canEdit={canEdit}
                      onEdit={() => setEditing({ circular: c })}
                      onDelete={() => deletion.ask(c)}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
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
