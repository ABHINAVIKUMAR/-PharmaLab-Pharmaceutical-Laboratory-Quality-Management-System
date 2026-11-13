import axios from 'axios'

export const TOKEN_KEY = 'pharmalab_token'
export const USER_KEY = 'pharmalab_user'

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Expired / invalid session -> clear it and let the app redirect to /login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.dispatchEvent(new Event('pharmalab:unauthorized'))
    }
    return Promise.reject(err)
  },
)

export const get = (url, params) => api.get(url, { params }).then((r) => r.data)
export const post = (url, body) => api.post(url, body).then((r) => r.data)
export const put = (url, body) => api.put(url, body).then((r) => r.data)
export const patch = (url, body) => api.patch(url, body).then((r) => r.data)
export const del = (url) => api.delete(url).then((r) => r.data)

/** Human readable message from an Axios/FastAPI error (handles validation + blocker lists). */
export function errMsg(err) {
  const detail = err?.response?.data?.detail
  if (!detail) {
    if (err?.code === 'ERR_NETWORK') return 'Cannot reach the API server. Is the backend running on port 8000?'
    return err?.message || 'Something went wrong'
  }
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = (d.loc || []).filter((p) => p !== 'body').join('.')
        const msg = String(d.msg || '').replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .join('; ')
  }
  if (detail.message) {
    return detail.blockers?.length ? `${detail.message} – ${detail.blockers.join('; ')}` : detail.message
  }
  return JSON.stringify(detail)
}

/** Upload a supporting document (optionally attached to a test result). Resolves to { url, filename, size, storage }. */
export async function uploadFile(file, resultId) {
  const form = new FormData()
  form.append('file', file)
  if (resultId) form.append('result_id', String(resultId))
  const res = await api.post('/api/files/upload', form)
  return res.data
}

/** Authenticated download (the endpoint needs the bearer token, so a plain <a href> would not work). */
export async function downloadFile(url) {
  const res = await api.get(url, { responseType: 'blob' })
  const name = url.split('/').pop().replace(/^[0-9a-f]{32}_/, '')
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
