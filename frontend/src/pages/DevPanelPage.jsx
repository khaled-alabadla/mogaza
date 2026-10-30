import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import logo from '../assets/logo-88.webp'
import GuideEditor from '../components/devpanel/GuideEditor'
import useContentField from '../components/devpanel/useContentField'
import Field, { controlClass } from '../components/Field'
import FormAlert from '../components/FormAlert'
import {
  ArrowLeftIcon,
  BookIcon,
  CheckIcon,
  DropIcon,
  EditIcon,
  ExternalIcon,
  InboxIcon,
  ListIcon,
  LogoutIcon,
  QuestionIcon,
  RestoreIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/Icons'
import LoadingState from '../components/LoadingState'
import Tricolor from '../components/Tricolor'
import { NAV_SECTIONS } from '../components/navLinks'
import { CONTENT_GROUPS, WIP_KEY } from '../content/registry'
import { useContentValue } from '../context/ContentContext'
import { useAuth } from '../context/AuthContext'
import { devAuthApi, setCsrfToken } from '../services/api'
import { parseApiError } from '../utils/errors'

/* «/dashboard» — the developer's hidden control panel: not linked anywhere, opened with a code
   e-mailed to the developer's address, and only for the developer (superuser) account. */

/** Step 1: the e-mail; step 2: the 6-digit code sent to it. */
function CodeLogin() {
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function sendCode(e) {
    e?.preventDefault()
    if (!email.trim()) return setError('أدخل البريد الإلكتروني.')
    setBusy(true)
    setError('')
    try {
      const { detail } = await devAuthApi.requestCode(email.trim())
      setInfo(detail)
      setSent(true)
    } catch (err) {
      setError(parseApiError(err, 'تعذر إرسال الرمز.').message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('الرمز 6 أرقام.')
    setBusy(true)
    setError('')
    try {
      const data = await devAuthApi.verify(email.trim(), code)
      setCsrfToken(data.csrf_token)
      await refresh()
    } catch (err) {
      setError(parseApiError(err, 'الرمز غير صحيح أو انتهت صلاحيته.').message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="" className="h-12 w-auto" width="26" height="48" />
          <h1 className="mt-4 text-xl font-bold text-ink">لوحة التحكم</h1>
          <p className="mt-1 text-sm text-muted">{sent ? 'أدخل الرمز المرسل إلى بريدك.' : 'سيصلك رمز دخول على بريدك الإلكتروني.'}</p>
        </div>
        <form onSubmit={sent ? verify : sendCode} noValidate className="card overflow-hidden">
          <Tricolor />
          <div className="space-y-4 p-6">
            <FormAlert message={error} />
            {!sent ? (
              <Field id="dev-email" label="البريد الإلكتروني">
                <input
                  id="dev-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  className={`${controlClass(false)} text-right`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </Field>
            ) : (
              <>
                {info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</p>}
                <Field id="dev-code" label="رمز الدخول">
                  <input
                    id="dev-code"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className={`${controlClass(false)} num text-center text-2xl tracking-[0.5em]`}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                </Field>
              </>
            )}
            <button type="submit" className="btn btn-primary w-full py-3" disabled={busy}>
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {sent ? 'دخول' : 'إرسال الرمز'}
            </button>
            {sent && (
              <div className="flex justify-between text-sm">
                <button type="button" className="text-brand-700 hover:underline" onClick={sendCode} disabled={busy}>
                  إعادة إرسال الرمز
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-ink"
                  onClick={() => {
                    setSent(false)
                    setCode('')
                    setError('')
                  }}
                >
                  تغيير البريد
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}

/** One text: edit in place; «حفظ» / «تراجع» appear once it changes, «الأصل» brings the default back. */
function TextField({ field }) {
  const { overridden, busy, save, reset, current } = useContentField(field.key)
  const saved = typeof current === 'string' ? current : field.default
  const [value, setValue] = useState(saved)
  const [shown, setShown] = useState(saved)
  if (shown !== saved) {
    // saved / reset elsewhere: show the new value
    setShown(saved)
    setValue(saved)
  }
  const changed = value !== saved
  const id = `content-${field.key}`
  const Control = field.type === 'textarea' ? 'textarea' : 'input'

  return (
    <div className="grid gap-2 px-5 py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-4">
      <label htmlFor={id} className="pt-2 text-sm text-muted">
        {field.label}
        {overridden && <span className="ms-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-400 align-middle" title="معدّل" />}
      </label>
      <div>
        <Control
          id={id}
          rows={field.type === 'textarea' ? 2 : undefined}
          className={`${controlClass(false)} py-2`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {(changed || overridden) && (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {changed ? (
              <>
                <button type="button" className="btn btn-secondary py-1.5" onClick={() => setValue(saved)} disabled={busy}>
                  تراجع
                </button>
                <button type="button" className="btn btn-primary py-1.5" onClick={() => save(value)} disabled={busy || !value.trim()}>
                  <CheckIcon className="h-4 w-4" /> حفظ
                </button>
              </>
            ) : (
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={reset} disabled={busy}>
                <RestoreIcon className="me-1 inline h-3.5 w-3.5" />
                استعادة النص الأصلي
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TextsTab() {
  return (
    <div className="space-y-4">
      {CONTENT_GROUPS.map((group) => {
        const fields = group.fields.filter((f) => f.type !== 'json')
        if (!fields.length) return null
        return (
          <section key={group.title} className="card overflow-hidden">
            <h2 className="px-5 pt-4 pb-1 font-bold text-ink">{group.title}</h2>
            <div className="divide-y divide-line">
              {fields.map((f) => (
                <TextField key={f.key} field={f} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Everything else the developer account can manage: it holds every permission on these pages. */
const MANAGE_LINKS = [
  { to: '/search', label: 'المواقع والشوارع', hint: 'إضافة وتعديل وحذف واستعادة المحذوف', icon: SearchIcon },
  { to: '/water', label: 'جدول المياه', hint: 'المواعيد والمناطق ومصادر المياه', icon: DropIcon },
  { to: '/complaints', label: 'الشكاوى', hint: 'السجل المؤقت والتصدير', icon: InboxIcon },
  { to: '/inquiries', label: 'الاستفسارات', hint: 'السجل المؤقت والتصدير', icon: QuestionIcon },
  { to: '/users', label: 'المستخدمون', hint: 'الحسابات والأدوار والصلاحيات', icon: UsersIcon },
  { to: '/audit-logs', label: 'سجل العمليات', hint: 'كل التعديلات ومن قام بها', icon: ListIcon },
]

/** «الصفحات قيد التطوير»: a switch per page; a page switched on shows everyone else «قيد التطوير». */
function DevelopmentPages() {
  const value = useContentValue(WIP_KEY)
  const pages = Array.isArray(value) ? value : []
  const field = useContentField(WIP_KEY)
  const links = NAV_SECTIONS.flatMap((s) => s.links).filter((l) => l.to !== '/')
  const toggle = (to) => field.save(pages.includes(to) ? pages.filter((p) => p !== to) : [...pages, to])
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-bold text-ink">الصفحات قيد التطوير</h2>
      <p className="mt-1 text-sm text-muted">
        الصفحة المفعّلة هنا تبقى ظاهرة في القائمة، لكن من يفتحها — حتى مدير النظام — يرى شاشة «قيد التطوير». أنت فقط ترى الصفحة.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {links.map(({ to, label, icon: Icon }) => {
          const on = pages.includes(to)
          return (
            <li key={to}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${label} قيد التطوير`}
                disabled={field.busy}
                onClick={() => toggle(to)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start ring-1 transition ${
                  on ? 'bg-gold-100 ring-gold-400/50' : 'bg-white ring-line hover:bg-canvas'
                }`}
              >
                <Icon className={`h-5 w-5 flex-none ${on ? 'text-gold-700' : 'text-muted'}`} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className={`block text-xs ${on ? 'font-semibold text-gold-700' : 'text-muted'}`}>{on ? 'قيد التطوير' : 'متاحة للجميع'}</span>
                </span>
                <span className={`relative h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-gold-700' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'start-[1.15rem]' : 'start-0.5'}`} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ManageTab() {
  return (
    <div className="space-y-4">
      <DevelopmentPages />
      <p className="text-sm text-muted">حسابك يملك كل الصلاحيات في هذه الصفحات، ولا يظهر لبقية المستخدمين.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MANAGE_LINKS.map(({ to, label, hint, icon: Icon }) => (
          <Link key={to} to={to} className="card group flex items-center gap-3 p-4 transition-colors hover:border-brand-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
            <ArrowLeftIcon className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand-600" />
          </Link>
        ))}
        <a href="/django-admin/" className="card group flex items-center gap-3 p-4 transition-colors hover:border-brand-500 sm:col-span-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">لوحة Django</span>
            <span className="block text-xs text-muted">الوصول المباشر لكل جداول قاعدة البيانات</span>
          </span>
          <ExternalIcon className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand-600" />
        </a>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'guide', label: 'دليل القسم', icon: BookIcon, Component: GuideEditor },
  { id: 'texts', label: 'نصوص الموقع', icon: EditIcon, Component: TextsTab },
  { id: 'manage', label: 'إدارة الموقع', icon: ShieldIcon, Component: ManageTab },
]

function Panel() {
  const { user, logout } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === searchParams.get('tab')) || TABS[0]
  const { Component } = tab

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <img src={logo} alt="" className="h-8 w-auto" width="18" height="32" />
          <p className="flex-1 font-bold text-ink">لوحة التحكم</p>
          <span className="num hidden text-sm text-muted sm:inline">{user.username}</span>
          <Link to="/" className="btn btn-secondary py-1.5">
            الموقع <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <button type="button" className="icon-action" aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={logout}>
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="أقسام لوحة التحكم" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {TABS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSearchParams({ tab: id }, { replace: true })}
                  aria-current={tab.id === id ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                    tab.id === id ? 'bg-white font-semibold text-brand-700 shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon className="h-[1.1rem] w-[1.1rem]" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0">
          <h1 className="mb-4 text-xl font-bold text-ink">{tab.label}</h1>
          <Component />
        </main>
      </div>
    </div>
  )
}

export default function DevPanelPage() {
  const { loading, user } = useAuth()
  if (loading) return <LoadingState />
  return user?.is_superuser ? <Panel /> : <CodeLogin />
}
