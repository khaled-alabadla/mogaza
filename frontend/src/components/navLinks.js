import { useAuth } from '../context/AuthContext'
import { DropIcon, InboxIcon, ListIcon, SearchIcon, UsersIcon } from './Icons'

/**
 * Main sections of the site (navbar + footer). `admin` links are shown to administrators only,
 * `editor` links to editors and administrators.
 */
export const NAV_LINKS = [
  { to: '/', label: 'البحث عن المواقع', short: 'البحث', icon: SearchIcon },
  { to: '/water', label: 'جدول المياه', short: 'جدول المياه', icon: DropIcon },
  { to: '/complaints', label: 'الشكاوى المؤقتة', short: 'الشكاوى', icon: InboxIcon, editor: true },
  { to: '/users', label: 'المستخدمون', short: 'المستخدمون', icon: UsersIcon, admin: true },
  { to: '/audit-logs', label: 'سجل العمليات', short: 'سجل العمليات', icon: ListIcon, admin: true },
]

export function visibleLinks({ isAdmin, canEdit, isAuthenticated, publicSearch }) {
  // Same rule as RequireSearchAccess: logged-in users, or anyone when public search is on.
  if (!isAuthenticated && !publicSearch) return []
  return NAV_LINKS.filter((l) => (l.admin ? isAdmin : l.editor ? canEdit : true))
}

/** The links the current visitor may open (empty while signed out without public search). */
export function useNavLinks() {
  return visibleLinks(useAuth())
}
