import { API_BASE_URL } from '../features/admin-dashboard/constants'

const FETCH_INTERCEPTOR_FLAG = '__avengersAdminFetchInstalled'
const AUTH_INVALID_EVENT = 'avengers-admin-auth-invalid'

export function getAdminSession() {
  const raw = window.localStorage.getItem('adminSession')
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getAdminAccessToken() {
  const session = getAdminSession()
  const rawToken = session?.token || session?.accessToken || null
  if (!rawToken) return null

  const normalized = String(rawToken).replace(/^Bearer\s+/i, '').trim()
  return normalized || null
}

function shouldAttachAuth(input) {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : ''
  return !url || url.startsWith(API_BASE_URL) || url.startsWith('/')
}

export function installAdminFetchInterceptor() {
  if (window[FETCH_INTERCEPTOR_FLAG]) return

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
    const token = getAdminAccessToken()

    if (token && shouldAttachAuth(input) && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await originalFetch(input, {
      ...init,
      headers,
    })

    if (response.status === 401 && shouldAttachAuth(input)) {
      const requestUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : ''
      if (!requestUrl.includes('/auth/login')) {
        // If we sent a token and the server still rejected it, the session is invalid.
        // Don't check message strings — gateway-wrapped errors have different formats.
        if (getAdminAccessToken()) {
          window.localStorage.removeItem('adminSession')
          window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, { detail: {} }))
        }
      }
    }

    return response
  }

  window[FETCH_INTERCEPTOR_FLAG] = true
}

export { AUTH_INVALID_EVENT }
