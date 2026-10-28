import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authCan, isPublicPermission } from '../context/permissions'
import { ShieldIcon } from './Icons'
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
  if (authCan(auth, perm)) return children
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
