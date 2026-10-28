import { useAuth } from '../context/AuthContext'
import { authCan } from '../context/permissions'
import { AlertIcon, BookIcon, GridIcon, MapIcon, ChartIcon, DropIcon, HomeIcon, InboxIcon, ListIcon, MegaphoneIcon, QuestionIcon, SearchIcon, UsersIcon } from './Icons'

/**
 * The site's sections (sidebar + footer + route-guard fallbacks). Adding a page = adding one entry:
 * `perm` is the permission key (or keys, any of them) needed to open it, `admin: true` limits it to
 * administrators. `short` is the compact label (collapsed sidebar tooltip).
 */
export const NAV_SECTIONS = [
  // «الرئيسية» on its own, above the sections (its title is for screen readers only)
  { id: 'home', title: 'الرئيسية', hideTitle: true, links: [{ to: '/', label: 'الرئيسية', short: 'الرئيسية', icon: GridIcon }] },
  {
    id: 'services',
    title: 'الخدمات',
    links: [
      { to: '/search', label: 'البحث عن المواقع', short: 'البحث', icon: SearchIcon, perm: 'search.view' },
      { to: '/water', label: 'جدول المياه', short: 'المياه', icon: DropIcon, perm: 'water.view' },
      { to: '/map', label: 'الخريطة', short: 'الخريطة', icon: MapIcon, perm: 'water.view' },
      { to: '/guide', label: 'دليل القسم', short: 'الدليل', icon: BookIcon, perm: 'guide.view' },
      { to: '/committees', label: 'لجان الأحياء', short: 'اللجان', icon: HomeIcon, perm: 'committees.view' },
      { to: '/circulars', label: 'تعميمات', short: 'تعميمات', icon: MegaphoneIcon, perm: 'circulars.view' },
    ],
  },
  {
    id: 'requests',
    title: 'الشكاوى والاستفسارات',
    links: [
      { to: '/urgent', label: 'الشكاوى العاجلة', short: 'العاجلة', icon: AlertIcon, perm: 'urgent.view' },
      { to: '/complaints', label: 'الشكاوى', short: 'الشكاوى', icon: InboxIcon, perm: 'complaints.view' },
      { to: '/inquiries', label: 'الاستفسارات', short: 'الاستفسارات', icon: QuestionIcon, perm: 'inquiries.view' },
      { to: '/daily-report', label: 'التقرير اليومي', short: 'التقرير', icon: ChartIcon, perm: 'report.view' },
    ],
  },
  {
    id: 'admin',
    title: 'الإدارة',
    links: [
      { to: '/users', label: 'المستخدمون', short: 'المستخدمون', icon: UsersIcon, admin: true },
      { to: '/audit-logs', label: 'سجل العمليات', short: 'السجل', icon: ListIcon, admin: true },
    ],
  },
]

/** Every link, flat, in sidebar order. */
export const NAV_LINKS = NAV_SECTIONS.flatMap((s) => s.links)

/** May `auth` (useAuth() or a plain { isAdmin, isAuthenticated, publicSearch, permissions }) open `link`? */
export function canOpen(auth, link) {
  if (link.admin) return Boolean(auth?.isAdmin)
  if (!link.perm) return Boolean(auth?.isAuthenticated)
  return authCan(auth, link.perm)
}

/** The links the visitor may open, flat (footer «روابط سريعة»). */
export function visibleLinks(auth) {
  return NAV_LINKS.filter((l) => canOpen(auth, l))
}

/** The sidebar sections with only the links the visitor may open (empty sections dropped). */
export function visibleSections(auth) {
  return NAV_SECTIONS.map((s) => ({ ...s, links: s.links.filter((l) => canOpen(auth, l)) })).filter(
    (s) => s.links.length > 0,
  )
}

/** The first page the visitor may open (route-guard fallback), or null. */
export function firstAllowedPath(auth) {
  return visibleLinks(auth)[0]?.to ?? null
}

/** The links the current visitor may open (empty while signed out without public search). */
export function useNavLinks() {
  return visibleLinks(useAuth())
}

/** Same, grouped in sidebar sections. */
export function useNavSections() {
  return visibleSections(useAuth())
}
