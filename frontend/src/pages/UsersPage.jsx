import { useMemo, useState } from 'react'
import { AddButton, DeleteButton, EditButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import Field, { controlClass } from '../components/Field'
import FormActions from '../components/FormActions'
import FormAlert from '../components/FormAlert'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import SearchInput from '../components/SearchInput'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useConfirmAction from '../hooks/useConfirmAction'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useFormSubmit from '../hooks/useFormSubmit'
import usePagedList from '../hooks/usePagedList'
import { usersApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { displayName, formatDateTime, ROLE_LABELS } from '../utils/format'

const PAGE_SIZE = 20
const ROLE_TONES = { admin: 'bg-gold-100 text-gold-700', editor: 'bg-brand-50 text-brand-700', viewer: 'bg-gray-100 text-muted' }

function UserForm({ user, isSelf, onSubmit, onCancel }) {
  const isEdit = Boolean(user)
  const [values, setValues] = useState({
    username: user?.username || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    role: user?.role || 'viewer',
    is_active: user ? user.is_active : true,
    password: '',
  })
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ المستخدم.')
  const set = (name) => (e) =>
    setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!values.username.trim()) clientErrors.username = 'اسم المستخدم مطلوب.'
    if (!isEdit && !values.password) clientErrors.password = 'كلمة المرور مطلوبة عند إنشاء مستخدم.'
    const payload = { ...values, username: values.username.trim(), email: values.email.trim() }
    if (!payload.password) delete payload.password
    if (isSelf) {
      // an admin cannot demote or deactivate their own account
      delete payload.role
      delete payload.is_active
    }
    submit(clientErrors, () => onSubmit(payload))
  }

  const field = (name, label, props = {}) => (
    <Field id={`u-${name}`} label={label} error={errors[name]}>
      <input id={`u-${name}`} className={controlClass(errors[name])} value={values[name]} onChange={set(name)} {...props} />
    </Field>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {field('username', 'اسم المستخدم *', { autoComplete: 'off', dir: 'ltr' })}
        {field('email', 'البريد الإلكتروني', { type: 'email', dir: 'ltr', autoComplete: 'off' })}
        {field('first_name', 'الاسم الأول')}
        {field('last_name', 'اسم العائلة')}
        <Field id="u-role" label="الدور" error={errors.role}>
          <select id="u-role" className="input" value={values.role} onChange={set('role')} disabled={isSelf}>
            <option value="viewer">مشاهد — بحث وعرض فقط</option>
            <option value="editor">محرر — بحث وإضافة وتعديل وحذف المواقع</option>
            <option value="admin">مدير النظام — كل الصلاحيات وإدارة المستخدمين</option>
          </select>
          {isSelf && <p className="mt-1 text-xs text-muted">لا يمكنك تغيير صلاحية حسابك الخاص.</p>}
        </Field>
        {field('password', isEdit ? 'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)' : 'كلمة المرور *', {
          type: 'password',
          autoComplete: 'new-password',
          dir: 'ltr',
        })}
        {isEdit && !isSelf && (
          <label className="tap flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={values.is_active} onChange={set('is_active')} />
            الحساب مفعّل
            {errors.is_active && <span className="field-error mt-0">{errors.is_active}</span>}
          </label>
        )}
      </div>
      <p className="text-xs text-muted">كلمة المرور: 8 أحرف على الأقل، ولا تكون أرقاماً فقط أو شائعة.</p>
      <FormActions saving={saving} submitLabel={isEdit ? 'حفظ التعديلات' : 'إنشاء المستخدم'} onCancel={onCancel} />
    </form>
  )
}

export default function UsersPage() {
  const { user: me, refresh } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search)
  const [editing, setEditing] = useState(null) // {user|null}

  const params = useMemo(() => ({ page, page_size: PAGE_SIZE, search: debounced.trim() || undefined }), [page, debounced])
  const { data, loading, error, reload } = usePagedList(usersApi.list, params)

  async function save(payload) {
    if (editing.user) {
      await usersApi.update(editing.user.id, payload)
      toast.success('تم تحديث بيانات المستخدم.')
      if (editing.user.id === me?.id) refresh() // own name / username changed
    } else {
      await usersApi.create(payload)
      toast.success('تم إنشاء المستخدم.')
    }
    setEditing(null)
    reload()
  }

  async function toggleActive(u) {
    try {
      await usersApi.update(u.id, { is_active: !u.is_active })
      toast.success(u.is_active ? 'تم تعطيل حساب المستخدم.' : 'تم تفعيل حساب المستخدم.')
      reload()
    } catch (err) {
      toast.error(parseApiError(err).message)
    }
  }

  const deletion = useConfirmAction((u) => usersApi.remove(u.id), { success: 'تم حذف المستخدم.', onDone: reload })

  return (
    <div>
      <PageHeader title="إدارة المستخدمين">
        <AddButton onClick={() => setEditing({ user: null })}>مستخدم جديد</AddButton>
      </PageHeader>
      <SearchInput
        className="mb-4 max-w-sm"
        label="بحث في المستخدمين"
        placeholder="بحث باسم المستخدم أو الاسم…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />

      <AsyncContent
        loading={loading}
        error={error}
        isEmpty={data.results.length === 0}
        empty={<EmptyState title="لا يوجد مستخدمون مطابقون" />}
      >
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {data.results.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{displayName(u)}</span>
                      <span className="num text-sm text-muted">@{u.username}</span>
                      <span className={`badge ${ROLE_TONES[u.role] || ROLE_TONES.viewer}`}>{ROLE_LABELS[u.role]}</span>
                      {!u.is_active && <span className="badge bg-danger-50 text-danger-700">معطّل</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      آخر دخول: <span className="tabular-nums">{formatDateTime(u.last_login)}</span>
                      {u.email && (
                        <>
                          {' · '}
                          <span className="num">{u.email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {u.is_superuser && !me?.is_superuser ? (
                      // only the superuser can manage the superuser account (enforced by the API too)
                      <span
                        className="badge self-center bg-gold-100 px-3 py-1 font-medium text-gold-700"
                        title="لا يمكن تعديل حساب المدير الأعلى أو حذفه إلا من قِبله."
                      >
                        المدير الأعلى — محمي
                      </span>
                    ) : (
                      <EditButton onClick={() => setEditing({ user: u })} />
                    )}
                    {u.is_superuser && !me?.is_superuser ? null : u.id === me?.id ? (
                      <span className="badge self-center bg-canvas px-3 py-1 font-medium text-muted">حسابك</span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-secondary" onClick={() => toggleActive(u)}>
                          {u.is_active ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <DeleteButton onClick={() => deletion.ask(u)} />
                      </>
                    )}
                  </div>
                </li>
            ))}
          </ul>
        </div>
      </AsyncContent>
      <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />

      <Modal open={Boolean(editing)} title={editing?.user ? 'تعديل مستخدم' : 'مستخدم جديد'} onClose={() => setEditing(null)}>
        {editing && (
          <UserForm
            user={editing.user}
            isSelf={Boolean(editing.user) && editing.user.id === me?.id}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="حذف المستخدم"
        message="هل أنت متأكد من حذف هذا المستخدم نهائياً؟ سيبقى سجل عملياته السابقة محفوظاً في سجل العمليات."
        details={deletion.target?.username}
        busy={deletion.busy}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </div>
  )
}
