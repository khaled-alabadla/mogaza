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
export const usersApi = crud('users')
/** Neighborhoods (الأحياء): `list` returns a plain, non-paginated array. */
export const neighborhoodsApi = crud('neighborhoods')
/** Official water distribution table: `list` → { today, today_display, results: [...] } (not paginated). */
export const waterTableApi = crud('water-table')
export const auditApi = { list: crud('audit-logs').list }
