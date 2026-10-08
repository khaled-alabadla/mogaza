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

/** Admin-only pages. The server enforces the same rule on every API call. */
export function RequireAdmin({ children }) {
  const { loading, isAuthenticated, isAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
