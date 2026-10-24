import { useEffect, useMemo, useState } from 'react'
import { AddButton } from '../components/ActionButtons'
import AsyncContent from '../components/AsyncContent'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import Field, { controlClass } from '../components/Field'
import FormActions from '../components/FormActions'
import FormAlert from '../components/FormAlert'
import { EditIcon, LockIcon, RestoreIcon, TrashIcon } from '../components/Icons'
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
import { authApi, usersApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { displayName, formatDateTime, ROLE_LABELS } from '../utils/format'
import { useText } from '../context/ContentContext'

const PAGE_SIZE = 20
const ROLE_TONES = {
  admin: 'bg-gold-100 text-gold-700 ring-1 ring-gold-400/40',
  editor: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
  viewer: 'bg-gray-100 text-muted ring-1 ring-line',
}
const AVATAR_TONES = { admin: 'bg-brand-800 text-gold-400', editor: 'bg-brand-100 text-brand-700', viewer: 'bg-gray-100 text-muted' }

/** 'complaints.edit' → 'complaints' (the section a key belongs to). */
const sectionOf = (key) => key.split('.')[0]
const isViewKey = (key) => key.endsWith('.view')
const sameSet = (a, b) => a.length === b.length && a.every((k) => b.includes(k))

/** The keys a role gets by default (the admin role always has every key). */
function roleDefaults(catalog, role) {
  if (role === 'admin') return catalog.permissions.map((p) => p.key)
  return catalog.role_defaults?.[role] || []
}

/** Does this user have a permission set different from their role's defaults? */
function hasCustomPermissions(user, catalog) {
  if (user.role === 'admin') return false
  if (typeof user.uses_role_defaults === 'boolean') return !user.uses_role_defaults
  if (!catalog || !Array.isArray(user.permissions)) return false
  return !sameSet(user.permissions, roleDefaults(catalog, user.role))
}

/**
 * Tick / untick one key, keeping the set sensible: editing or exporting a section implies viewing it,
 * and no longer viewing a section drops its other rights.
 */
function toggleKey(current, key, on) {
  const next = new Set(current)
  if (on) {
    next.add(key)
    if (!isViewKey(key)) next.add(`${sectionOf(key)}.view`)
  } else {
    next.delete(key)
    if (isViewKey(key)) for (const k of current) if (sectionOf(k) === sectionOf(key)) next.delete(k)
  }
  return next
}

/** «الصلاحيات»: the permission checkboxes, grouped like the API groups them. */
function PermissionsFieldset({ catalog, selected, disabled, onChange }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of catalog.permissions) {
      if (!map.has(p.group)) map.set(p.group, [])
      map.get(p.group).push(p)
    }
    return [...map.entries()]
  }, [catalog])

  function toggleGroup(items, on) {
    let next = new Set(selected)
    for (const p of items) next = toggleKey(next, p.key, on)
    onChange(next)
  }

  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-bold text-ink">الصلاحيات</legend>
      {disabled && <p className="mb-3 text-xs text-muted">مدير النظام يملك كل الصلاحيات.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(([group, items]) => {
          const all = items.every((p) => selected.has(p.key))
          return (
            <div key={group} className="rounded-lg bg-canvas px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{group}</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-brand-600"
                    checked={all}
                    disabled={disabled}
                    onChange={(e) => toggleGroup(items, e.target.checked)}
                    aria-label={`كل صلاحيات ${group}`}
                  />
                  الكل
                </label>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {items.map((p) => (
                  <label key={p.key} className="tap flex cursor-pointer items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={selected.has(p.key)}
                      disabled={disabled}
                      onChange={(e) => onChange(toggleKey(selected, p.key, e.target.checked))}
                      aria-label={`${group}: ${p.label}`}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

function UserForm({ user, isSelf, catalog, onSubmit, onCancel }) {
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
  const initialPerms = (cat) => new Set(Array.isArray(user?.permissions) ? user.permissions : roleDefaults(cat, values.role))
  // null until the permissions list has loaded (until then the section is neither shown nor submitted)
  const [perms, setPerms] = useState(() => (catalog ? initialPerms(catalog) : null))
  useEffect(() => {
    if (catalog && perms === null) setPerms(initialPerms(catalog))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ المستخدم.')
  const set = (name) => (e) =>
    setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function changeRole(e) {
    const role = e.target.value
    setValues((v) => ({ ...v, role }))
    if (catalog) setPerms(new Set(roleDefaults(catalog, role))) // a new role starts from its defaults
  }
  const isAdminRole = values.role === 'admin'
  const shownPerms = catalog && perms ? (isAdminRole ? new Set(roleDefaults(catalog, 'admin')) : perms) : null

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!values.username.trim()) clientErrors.username = 'اسم المستخدم مطلوب.'
    if (!isEdit && !values.password) clientErrors.password = 'كلمة المرور مطلوبة عند إنشاء مستخدم.'
    const payload = { ...values, username: values.username.trim(), email: values.email.trim() }
    if (!payload.password) delete payload.password
    if (catalog && perms && !isAdminRole) {
      // exactly the role's defaults is sent as null, so the account keeps following its role
      const keys = catalog.permissions.map((p) => p.key).filter((k) => perms.has(k))
      payload.permissions = sameSet(keys, roleDefaults(catalog, values.role)) ? null : keys
    }
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
          <select id="u-role" className="input" value={values.role} onChange={changeRole} disabled={isSelf}>
            <option value="viewer">مشاهد (بحث وعرض فقط)</option>
            <option value="editor">محرر (بحث وإضافة وتعديل وحذف المواقع)</option>
            <option value="admin">مدير النظام (كل الصلاحيات وإدارة المستخدمين)</option>
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
      {shownPerms && (
        <PermissionsFieldset catalog={catalog} selected={shownPerms} disabled={isAdminRole} onChange={setPerms} />
      )}
      <p className="text-xs text-muted">كلمة المرور: 6 أحرف أو أرقام على الأقل.</p>
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

  // the permission keys and each role's defaults (for the form and the «صلاحيات مخصّصة» badge)
  const [catalog, setCatalog] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    authApi
      .permissions(controller.signal)
      .then((result) => setCatalog(Array.isArray(result?.permissions) ? result : null))
      .catch(() => {})
    return () => controller.abort()
  }, [])

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

  const pageSubtitle = useText('users.subtitle')
  const deletion = useConfirmAction((u) => usersApi.remove(u.id), { success: 'تم حذف المستخدم.', onDone: reload })

  return (
    <div>
      <PageHeader title="إدارة المستخدمين" subtitle={pageSubtitle}>
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
          {/* column titles (wide screens) */}
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem] gap-4 border-b border-line bg-canvas px-5 py-2.5 text-xs font-bold text-muted lg:grid">
            <span>المستخدم</span>
            <span>الدور والصلاحيات</span>
            <span>آخر دخول</span>
            <span className="text-end">إجراءات</span>
          </div>
          <ul className="divide-y divide-line">
            {data.results.map((u) => (
              <li
                key={u.id}
                className={`grid gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem] lg:items-center lg:gap-4 ${
                  u.is_active ? '' : 'opacity-70'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${AVATAR_TONES[u.role] || AVATAR_TONES.viewer}`}
                    aria-hidden="true"
                  >
                    {displayName(u).trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-ink">{displayName(u)}</span>
                      {u.id === me?.id && <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-100">حسابك</span>}
                      {!u.is_active && <span className="badge bg-danger-50 text-danger-700 ring-1 ring-danger-100">معطّل</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      <span className="num">@{u.username}</span>
                      {u.email && (
                        <>
                          {' · '}
                          <span className="num">{u.email}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`badge ${ROLE_TONES[u.role] || ROLE_TONES.viewer}`}>{ROLE_LABELS[u.role]}</span>
                  {hasCustomPermissions(u, catalog) && (
                    <span
                      className="badge bg-white text-ink ring-1 ring-line"
                      title={(catalog?.permissions || [])
                        .filter((p) => (u.permissions || []).includes(p.key))
                        .map((p) => `${p.group}: ${p.label}`)
                        .join('، ')}
                    >
                      صلاحيات مخصّصة (<span className="num">{(u.permissions || []).length}</span>)
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted">
                  <span className="lg:hidden">آخر دخول: </span>
                  <span className="tabular-nums">{formatDateTime(u.last_login)}</span>
                </div>
                <div className="flex gap-0.5 lg:justify-end">
                  <button type="button" className="icon-action" aria-label="تعديل" title="تعديل" onClick={() => setEditing({ user: u })}>
                    <EditIcon className="h-[1.1rem] w-[1.1rem]" />
                  </button>
                  {u.id !== me?.id && (
                    <>
                      <button
                        type="button"
                        className="icon-action"
                        aria-label={u.is_active ? 'تعطيل' : 'تفعيل'}
                        title={u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? <LockIcon className="h-[1.1rem] w-[1.1rem]" /> : <RestoreIcon className="h-[1.1rem] w-[1.1rem]" />}
                      </button>
                      <button type="button" className="icon-action icon-action-danger" aria-label="حذف" title="حذف" onClick={() => deletion.ask(u)}>
                        <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </AsyncContent>
      <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onChange={setPage} />

      <Modal size="form" open={Boolean(editing)} title={editing?.user ? 'تعديل مستخدم' : 'مستخدم جديد'} onClose={() => setEditing(null)}>
        {editing && (
          <UserForm
            user={editing.user}
            isSelf={Boolean(editing.user) && editing.user.id === me?.id}
            catalog={catalog}
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
