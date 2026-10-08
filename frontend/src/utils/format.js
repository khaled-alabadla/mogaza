const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(value) {
  if (!value) return '—'
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

export const ROLE_LABELS = { admin: 'مدير النظام', editor: 'محرر', viewer: 'مشاهد' }

/** "first last", or the username when no name is set. */
export function displayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
}
