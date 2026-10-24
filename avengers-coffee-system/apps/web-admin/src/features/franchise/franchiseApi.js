import { getAdminAccessToken } from '../../lib/adminFetch'
import { API_BASE_URL } from '../admin-dashboard/constants'

export async function franchiseApi(path, options = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener('abort', forwardAbort, { once:true })
  const reading = !options.method || options.method.toUpperCase() === 'GET'
  const timer = reading ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const token = getAdminAccessToken()
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options, signal:controller.signal,
      headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {}),...options.headers},
    })
    const payload = response.ok ? await response.json() : await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message || 'Không tải được dữ liệu. Vui lòng thử lại.')
    return payload
  } catch(error) {
    if (error.name === 'AbortError' && !options.signal?.aborted) throw new Error('Tải dữ liệu quá lâu. Kiểm tra kết nối và bấm Tải lại.')
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}
