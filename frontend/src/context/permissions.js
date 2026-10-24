/**
 * Permission keys sent by /api/auth/me (`user.permissions`). The API enforces them; the client only
 * uses them to show / hide links and to guard routes.
 */
export const PERMISSIONS = [
  'search.view',
  'search.edit',
  'water.view',
  'water.edit',
  'complaints.view',
  'complaints.edit',
  'complaints.export',
  'inquiries.view',
  'inquiries.edit',
  'inquiries.export',
  'guide.view',
]

/** What an anonymous visitor may open when the server enables public search. */
export const PUBLIC_PERMISSIONS = ['search.view', 'water.view']

/**
 * The user's permission keys. Before the server sent `permissions`, rights were two flags:
 * keep that older answer working (signed-in → view search/water, editor → everything else).
 */
export function permissionsOf(user) {
  if (!user) return []
  if (Array.isArray(user.permissions)) return user.permissions
  if (user.is_admin || user.can_edit) return PERMISSIONS
  return PUBLIC_PERMISSIONS
}

/**
 * Pure permission check. `perm` is a key or an array of keys (any of them is enough).
 * `auth` = { isAdmin, isAuthenticated, publicSearch, permissions }.
 */
export function checkPermission(auth, perm) {
  const keys = Array.isArray(perm) ? perm : [perm]
  const { isAdmin, isAuthenticated, publicSearch, permissions = [] } = auth || {}
  return keys.some(
    (key) =>
      Boolean(isAdmin) ||
      permissions.includes(key) ||
      (!isAuthenticated && Boolean(publicSearch) && PUBLIC_PERMISSIONS.includes(key)),
  )
}

/** `auth.can(perm)` when available (useAuth()), else the same check on a plain auth object (test mocks). */
export function authCan(auth, perm) {
  return typeof auth?.can === 'function' ? auth.can(perm) : checkPermission(auth, perm)
}

/** Can a signed-out visitor open a page needing `perm` (public search on)? */
export function isPublicPermission(perm, publicSearch) {
  const keys = Array.isArray(perm) ? perm : [perm]
  return Boolean(publicSearch) && keys.some((k) => PUBLIC_PERMISSIONS.includes(k))
}
