import { useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import ChangePasswordForm from '../components/ChangePasswordForm'
import Field, { controlClass } from '../components/Field'
import FormAlert from '../components/FormAlert'
import { CameraIcon, CheckIcon, KeyIcon, UserIcon } from '../components/Icons'
import { useNavLinks } from '../components/navLinks'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import useFormSubmit from '../hooks/useFormSubmit'
import { authApi } from '../services/api'
import { parseApiError } from '../utils/errors'
import { displayName } from '../utils/format'
import { squareImage } from '../utils/resizeImage'

/** A titled card of the profile page. */
function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="card overflow-hidden" aria-label={title}>
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3 sm:px-5">
        <Icon className="h-5 w-5 text-brand-600" />
        <div>
          <h2 className="font-bold text-ink">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/**
 * The profile picture: a click on it picks a file, which is cut to a small square in the browser before
 * it is uploaded; «إزالة الصورة» goes back to the letter.
 */
function AvatarPicker({ user, onChanged }) {
  const toast = useToast()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)

  async function upload(file) {
    if (!file) return
    setBusy(true)
    try {
      await authApi.setAvatar(await squareImage(file))
      await onChanged()
      toast.success('تم تحديث صورتك.')
    } catch (err) {
      toast.error(err?.response ? parseApiError(err, 'تعذر رفع الصورة.').message : err?.message || 'تعذر رفع الصورة.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = '' // the same file can be picked again
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await authApi.removeAvatar()
      await onChanged()
      toast.success('تمت إزالة الصورة.')
    } catch {
      toast.error('تعذر إزالة الصورة.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="peer sr-only"
        id="avatar-file"
        onChange={(e) => upload(e.target.files?.[0])}
        disabled={busy}
      />
      {/* the picture itself opens the file picker (a camera in its corner says so) */}
      <label
        htmlFor="avatar-file"
        title={user.avatar ? 'تغيير الصورة' : 'إضافة صورة'}
        className={`group relative block cursor-pointer rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 ${busy ? 'pointer-events-none' : ''}`}
      >
        <span className="sr-only">{user.avatar ? 'تغيير الصورة' : 'إضافة صورة'}</span>
        <Avatar user={user} className="h-16 w-16 text-2xl ring-4 ring-brand-50" />
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        >
          <CameraIcon className="h-6 w-6" />
        </span>
        <span
          className="absolute -end-0.5 -bottom-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow ring-2 ring-white"
          aria-hidden="true"
        >
          <CameraIcon className="h-3.5 w-3.5" />
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/75" role="status" aria-label="جارٍ الرفع">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
          </span>
        )}
      </label>
      {user.avatar && (
        <button type="button" className="text-[0.7rem] font-medium text-danger-700 hover:underline" onClick={remove} disabled={busy}>
          إزالة الصورة
        </button>
      )}
    </div>
  )
}

/** Name, e-mail and username (a new username asks for the current password). */
function DetailsForm({ user, onSaved }) {
  const [values, setValues] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    username: user.username || '',
    current_password: '',
  })
  const { errors, formError, saving, submit } = useFormSubmit('تعذر حفظ البيانات.')
  const usernameChanged = values.username.trim().toLowerCase() !== user.username.toLowerCase()
  const changed =
    usernameChanged ||
    values.first_name.trim() !== (user.first_name || '') ||
    values.last_name.trim() !== (user.last_name || '') ||
    values.email.trim() !== (user.email || '')
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!values.username.trim()) clientErrors.username = 'يرجى إدخال اسم المستخدم.'
    if (usernameChanged && !values.current_password) clientErrors.current_password = 'أدخل كلمة المرور الحالية لتغيير اسم المستخدم.'
    submit(clientErrors, async () => {
      const body = { first_name: values.first_name, last_name: values.last_name, email: values.email, username: values.username.trim() }
      if (usernameChanged) body.current_password = values.current_password
      await authApi.updateProfile(body)
      setValues((v) => ({ ...v, current_password: '' }))
      await onSaved()
    })
  }

  const text = (key, label, props = {}) => (
    <Field id={`profile-${key}`} label={label} error={errors[key]}>
      <input
        id={`profile-${key}`}
        className={controlClass(errors[key])}
        value={values[key]}
        onChange={set(key)}
        aria-invalid={Boolean(errors[key])}
        {...props}
      />
    </Field>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {text('first_name', 'الاسم الأول', { autoComplete: 'given-name' })}
        {text('last_name', 'اسم العائلة', { autoComplete: 'family-name' })}
        {text('email', 'البريد الإلكتروني', { type: 'email', dir: 'ltr', autoComplete: 'email', placeholder: 'name@example.com' })}
        {text('username', 'اسم المستخدم (للدخول)', { dir: 'ltr', autoComplete: 'username', autoCapitalize: 'none', spellCheck: false })}
      </div>
      {usernameChanged && (
        <div className="rounded-xl bg-gold-100/60 p-4 ring-1 ring-gold-400/40">
          <p className="mb-3 text-sm text-gold-700">ستسجّل الدخول لاحقاً باسم المستخدم الجديد. للتأكيد، أدخل كلمة المرور الحالية.</p>
          {text('current_password', 'كلمة المرور الحالية', { type: 'password', autoComplete: 'current-password' })}
        </div>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={saving || !changed}>
          <CheckIcon className="h-4 w-4" /> {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </button>
      </div>
    </form>
  )
}

/** «الملف الشخصي»: the signed-in user's own account — details, password, and the pages open to them. */
export default function ProfilePage() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const links = useNavLinks().filter((l) => l.to !== '/')
  const [passwordKey, setPasswordKey] = useState(0) // a fresh, empty password form after each change
  if (!user) return null
  const name = displayName(user)

  return (
    <div>
      <PageHeader title="الملف الشخصي" subtitle="بيانات حسابك وكلمة المرور." />

      {/* who: avatar, name, username, role */}
      <div className="card mb-5 flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <AvatarPicker user={user} onChanged={refresh} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-ink">{name}</p>
          <p className="num text-sm text-muted" dir="ltr">
            @{user.username}
          </p>
        </div>
        <span className="badge bg-brand-50 text-brand-700">{user.role_display}</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Section icon={UserIcon} title="البيانات الشخصية">
            <DetailsForm
              key={user.username}
              user={user}
              onSaved={async () => {
                await refresh()
                toast.success('تم حفظ بياناتك.')
              }}
            />
          </Section>
          <Section icon={KeyIcon} title="كلمة المرور" hint="بعد التغيير تبقى مسجّل الدخول على هذا الجهاز.">
            <ChangePasswordForm
              key={passwordKey}
              inline
              onDone={() => {
                setPasswordKey((k) => k + 1)
                toast.success('تم تغيير كلمة المرور بنجاح.')
              }}
            />
          </Section>
        </div>

        {/* what the account can open (set by the administrator) */}
        <Section icon={CheckIcon} title="الصفحات المتاحة لك" hint="يحددها مدير النظام.">
          {links.length ? (
            <ul className="grid gap-1.5">
              {links.map(({ to, label, icon: Icon }) => (
                <li key={to} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">لا توجد صفحات متاحة لحسابك بعد. تواصل مع مدير النظام.</p>
          )}
        </Section>
      </div>
    </div>
  )
}
