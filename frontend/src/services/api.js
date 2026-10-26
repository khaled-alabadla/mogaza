import axios from 'axios'

// All data comes from the Django REST API (which reads PostgreSQL). Same-origin: /api
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: { Accept: 'application/json' },
  timeout: 20000,
})

let csrfToken = null
export function setCsrfToken(token) {
  csrfToken = token
}

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (csrfToken && !['get', 'head', 'options'].includes(method)) {
    config.headers['X-CSRFToken'] = csrfToken
  }
  return config
})

let onUnauthorized = null
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    if ((status === 401 || status === 403) && onUnauthorized && !url.startsWith('/auth/')) {
      onUnauthorized(error)
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  me: () => api.get('/auth/me/').then((r) => r.data),
  login: (username, password) => api.post('/auth/login/', { username, password }).then((r) => r.data),
  logout: () => api.post('/auth/logout/'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password/', { current_password, new_password }).then((r) => r.data),
  /** (admin) → { permissions: [{ key, label, group }], role_defaults: { admin: [...], editor: [...], viewer: [...] } } */
  permissions: (signal) => api.get('/auth/permissions/', { signal }).then((r) => r.data),
}

/** Site texts edited from the developer dashboard: { key: value } (only the edited ones). */
export const contentApi = {
  all: () => api.get('/content/').then((r) => r.data),
  save: (key, value) => api.put(`/dev/content/${key}/`, { value }).then((r) => r.data),
  reset: (key) => api.delete(`/dev/content/${key}/`),
}

/** The developer's e-mailed login code («/dashboard»). */
export const devAuthApi = {
  requestCode: (email) => api.post('/dev/otp/request/', { email }).then((r) => r.data),
  verify: (email, code) => api.post('/dev/otp/verify/', { email, code }).then((r) => r.data),
}

function crud(resource) {
  return {
    list: (params, signal) => api.get(`/${resource}/`, { params, signal }).then((r) => r.data),
    create: (data) => api.post(`/${resource}/`, data).then((r) => r.data),
    update: (id, data) => api.patch(`/${resource}/${id}/`, data).then((r) => r.data),
    remove: (id) => api.delete(`/${resource}/${id}/`),
  }
}

/** CRUD + restore of a soft-deleted record (locations and street names). */
function restorable(resource) {
  return { ...crud(resource), restore: (id) => api.post(`/${resource}/${id}/restore/`).then((r) => r.data) }
}

export const locationsApi = restorable('locations')
export const streetsApi = restorable('streets')
export const committeesApi = restorable('committees')
export const circularsApi = restorable('circulars')
export const usersApi = crud('users')
/** Neighborhoods (الأحياء): `list` returns a plain, non-paginated array. */
export const neighborhoodsApi = crud('neighborhoods')
/** Official water distribution table: `list` → { today, today_display, results: [...] } (not paginated). */
export const waterTableApi = crud('water-table')
/**
 * Complaints and inquiries (`kind`): list adds `pending_count`. `exportUrl` is a formatted .xlsx of
 * every record matching the same filters (kind required).
 */
export const complaintsApi = {
  ...restorable('complaints'),
  markUploaded: (ids, uploaded = true) => api.post('/complaints/mark-uploaded/', { ids, uploaded }).then((r) => r.data),
  exportUrl: (params) => `/api/complaints/export/?${new URLSearchParams(params)}`,
}
/** «الشكاوى العاجلة»: list adds `unresolved_count`; the Excel export uses the list's filters. */
export const urgentApi = {
  ...restorable('urgent-complaints'),
  markResolved: (ids, resolved = true) => api.post('/urgent-complaints/mark-resolved/', { ids, resolved }).then((r) => r.data),
  exportUrl: (params) => `/api/urgent-complaints/export/?${new URLSearchParams(params)}`,
}
/** «التقرير اليومي»: only the latest report is kept → { report: {...} | null } */
export const dailyReportApi = {
  get: (signal) => api.get('/daily-report/', { signal }).then((r) => r.data),
  save: (report) => api.put('/daily-report/', report).then((r) => r.data),
}
export const auditApi = { list: crud('audit-logs').list }
