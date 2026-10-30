import { Link, Navigate, useLocation } from 'react-router-dom'
import { WIP_KEY } from '../content/registry'
import { useAuth } from '../context/AuthContext'
import { useContentValue } from '../context/ContentContext'
import { authCan, isPublicPermission } from '../context/permissions'
import { ShieldIcon, ToolsIcon } from './Icons'
import LoadingState from './LoadingState'
import { firstAllowedPath } from './navLinks'

/** Shown when the visitor may open no page at all (or the fallback would be the page itself). */
export function NoAccess() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 text-gold-700">
        <ShieldIcon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold text-ink">لا تملك صلاحية</h1>
      <p className="mt-1 text-sm text-muted">ليس لحسابك صلاحية فتح هذه الصفحة. تواصل مع مسؤول النظام إن كنت تحتاجها.</p>
    </div>
  )
}

/** «قيد التطوير»: what everyone but the developer sees on a page the developer is still working on. */
export function UnderDevelopment() {
  return (
    <div className="page-enter flex min-h-[60vh] items-center justify-center px-4">
      <div className="card relative w-full max-w-lg overflow-hidden p-10 text-center">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-brand-600 via-gold-400 to-brand-600" aria-hidden="true" />
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-8 ring-brand-50/50">
          <ToolsIcon className="h-8 w-8" />
        </span>
        <h1 className="mt-6 text-2xl font-bold text-ink">الصفحة قيد التطوير</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          نعمل حالياً على تطوير هذه الصفحة وتحسينها، وستكون متاحة قريباً بإذن الله.
        </p>
        <Link to="/" className="btn btn-primary mt-7 inline-flex">
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  )
}

/** The developer's view of such a page: a strip says only he sees it. */
function DevelopmentNotice() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-xl bg-gold-100 px-4 py-2.5 text-sm font-semibold text-gold-700 ring-1 ring-gold-400/40">
      <ToolsIcon className="h-4 w-4 flex-none" />
      هذه الصفحة «قيد التطوير»: تظهر لك فقط، وبقية المستخدمين يرون شاشة «قيد التطوير».
    </p>
  )
}

/** A page under development: the developer sees it (with a notice), everyone else the «قيد التطوير» screen. */
function DevelopmentGate({ children }) {
  const { pathname } = useLocation()
  const auth = useAuth()
  const pages = useContentValue(WIP_KEY)
  const section = `/${pathname.split('/')[1] || ''}`
  if (!Array.isArray(pages) || !pages.includes(section)) return children
  if (!auth.isSuperuser) return <UnderDevelopment />
  return (
    <>
      <DevelopmentNotice />
      {children}
    </>
  )
}

/**
 * Not allowed here: go to the first page the visitor may open, or show «لا تملك صلاحية»
 * (never redirect to the current page — no loop when "/" itself is not allowed).
 */
function Fallback({ auth }) {
  const { pathname } = useLocation()
  const to = firstAllowedPath(auth)
  if (!to || to === pathname) return <NoAccess />
  return <Navigate to={to} replace />
}

/**
 * Pages needing a permission key (or any of several). Signed-out visitors go to /login, except for
 * the publicly viewable pages (search / water) while the server enables public search.
 */
export function RequirePermission({ perm, children }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <LoadingState />
  if (authCan(auth, perm)) return <DevelopmentGate>{children}</DevelopmentGate>
  if (!auth.isAuthenticated && !isPublicPermission(perm, auth.publicSearch)) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Fallback auth={auth} />
}

/**
 * The home page: signed-in users. A signed-out visitor goes to the public search when the server allows
 * it, otherwise to the login page.
 */
export function RequireHome({ children }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <LoadingState />
  if (auth.isAuthenticated) return children
  if (isPublicPermission('search.view', auth.publicSearch)) return <Navigate to="/search" replace />
  return <Navigate to="/login" replace state={{ from: location }} />
}

/** Search page (kept for older imports): same as <RequirePermission perm="search.view">. */
export const RequireSearchAccess = ({ children }) => <RequirePermission perm="search.view">{children}</RequirePermission>

/** Signed-in users for whom `allowed(auth)` is true; others go to the first page they may open. The API enforces the same. */
function RequireRole({ allowed, children }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <LoadingState />
  if (!auth.isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!allowed(auth)) return <Fallback auth={auth} />
  return children
}

/** Any signed-in user (the profile page). */
export const RequireSignedIn = ({ children }) => <RequireRole allowed={() => true}>{children}</RequireRole>

/** Admin-only pages (users, audit log). */
export const RequireAdmin = ({ children }) => <RequireRole allowed={(a) => a.isAdmin}>{children}</RequireRole>

/** Admins and editors (kept for older imports; prefer RequirePermission). */
export const RequireEditor = ({ children }) => <RequireRole allowed={(a) => a.canEdit}>{children}</RequireRole>
