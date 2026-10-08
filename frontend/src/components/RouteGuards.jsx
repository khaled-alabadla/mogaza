import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingState from './LoadingState'

/** Search page: logged-in users, or anyone when public search is enabled on the server. */
export function RequireSearchAccess({ children }) {
  const { loading, isAuthenticated, publicSearch } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!isAuthenticated && !publicSearch) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

/** Signed-in users for whom `allowed(auth)` is true; others go to the search page. The API enforces the same. */
function RequireRole({ allowed, children }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.loading) return <LoadingState />
  if (!auth.isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!allowed(auth)) return <Navigate to="/" replace />
  return children
}

/** Admin-only pages (users, audit log). */
export const RequireAdmin = ({ children }) => <RequireRole allowed={(a) => a.isAdmin}>{children}</RequireRole>

/** Admins and editors (temporary complaints: citizens' personal data). */
export const RequireEditor = ({ children }) => <RequireRole allowed={(a) => a.canEdit}>{children}</RequireRole>
