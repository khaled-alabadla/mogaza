// The calligraphic font is only used on this page.
import '@fontsource/aref-ruqaa/700.css'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import logo from '../assets/logo-320.webp'
import Credits from '../components/Credits'
import Field, { controlClass } from '../components/Field'
import FormAlert from '../components/FormAlert'
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from '../components/Icons'
import LoadingState from '../components/LoadingState'
import Tricolor from '../components/Tricolor'
import { useAuth } from '../context/AuthContext'
import useFormSubmit from '../hooks/useFormSubmit'

function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-12 bg-gradient-to-l from-gold-400 to-transparent sm:w-20" />
      <span className="h-2 w-2 rotate-45 bg-danger-600" />
      <span className="h-2.5 w-2.5 rotate-45 bg-gold-400" />
      <span className="h-2 w-2 rotate-45 bg-danger-600" />
      <span className="h-px w-12 bg-gradient-to-r from-gold-400 to-transparent sm:w-20" />
    </div>
  )
}

const creditsGrid = 'grid grid-cols-2 gap-4 text-center text-xs leading-relaxed'

export default function LoginPage() {
  const { login, isAuthenticated, loading, publicSearch } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { errors, formError, saving: submitting, submit } = useFormSubmit('تعذر تسجيل الدخول.')
  const [showPassword, setShowPassword] = useState(false)

  const from = location.state?.from?.pathname || '/'

  if (loading) return <LoadingState />
  if (isAuthenticated) return <Navigate to={from} replace />

  function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = {}
    if (!username.trim()) clientErrors.username = 'يرجى إدخال اسم المستخدم.'
    if (!password) clientErrors.password = 'يرجى إدخال كلمة المرور.'
    submit(
      clientErrors,
      async () => {
        await login(username.trim(), password)
        navigate(from, { replace: true })
      },
      { onError: () => setPassword('') },
    )
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Identity panel with the dedication "أثرٌ جميل ... قبل الرحيل" */}
      <aside className="relative flex flex-col items-center justify-center overflow-hidden bg-brand-800 px-6 py-10 text-white lg:py-16">
        <div className="harlequin" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(10_107_56/0.55),transparent_70%)]"
          aria-hidden="true"
        />
        <Tricolor className="absolute inset-x-0 top-0 flex h-1.5" green="bg-brand-500" />

        <div className="relative flex flex-col items-center text-center">
          <div className="rounded-2xl bg-white p-3 shadow-lg ring-1 ring-white/20 lg:p-4">
            <img src={logo} alt="شعار بلدية غزة" className="h-24 w-auto lg:h-40" width="87" height="160" decoding="async" />
          </div>

          <figure className="mt-8 lg:mt-12">
            <blockquote className="font-ruqaa leading-tight" lang="ar">
              <p className="quote-reveal text-5xl text-white drop-shadow-sm sm:text-6xl lg:text-7xl">أثرٌ جميل</p>
              <div className="quote-reveal my-3 lg:my-5">
                <Ornament />
              </div>
              <p className="quote-reveal-late text-4xl text-gold-400 sm:text-5xl lg:text-6xl">قبل الرحيل</p>
            </blockquote>
          </figure>
        </div>

        <Credits className={`${creditsGrid} relative mt-12 hidden w-full max-w-md text-white/70 lg:mt-16 lg:grid`} />
      </aside>

      {/* Sign-in form */}
      <main className="relative flex flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
        <div className="harlequin-soft" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-gold-100/80 blur-3xl" aria-hidden="true" />

        <div className="relative w-full max-w-md">
          <div className="mb-7 text-center">
            <h1 className="text-3xl font-bold text-ink">مرحباً بك</h1>
            <p className="mt-2 text-sm text-muted">سجّل الدخول للوصول إلى قسم المعلومات والشكاوي</p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 shadow-brand-800/5 ring-line"
          >
            <Tricolor />

            <div className="space-y-5 p-7 sm:p-8">
              <FormAlert message={formError} className="rounded-xl px-4 py-3" />

              <Field id="username" label="اسم المستخدم" error={errors.username}>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted">
                    <UserIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="username"
                    type="text"
                    dir="ltr"
                    className={`${controlClass(errors.username, 'login-input')} pr-11 text-right`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    aria-invalid={Boolean(errors.username)}
                  />
                </div>
              </Field>

              <Field id="password" label="كلمة المرور" error={errors.password}>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted">
                    <LockIcon className="h-5 w-5" />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    className={`${controlClass(errors.password, 'login-input')} pr-11 pl-11 text-right`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 left-0 flex w-11 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </Field>

              <button
                type="submit"
                className="group btn btn-primary w-full rounded-xl py-3.5 text-base shadow-lg shadow-brand-600/25 hover:shadow-brand-600/35"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    جارٍ تسجيل الدخول…
                  </>
                ) : (
                  <>
                    تسجيل الدخول
                    <ArrowLeftIcon className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {publicSearch && (
            <p className="mt-5 text-center text-sm">
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => navigate('/')}>
                البحث بدون تسجيل دخول
              </button>
            </p>
          )}

          <Credits className={`${creditsGrid} mt-10 text-muted lg:hidden`} />
        </div>
      </main>
    </div>
  )
}
