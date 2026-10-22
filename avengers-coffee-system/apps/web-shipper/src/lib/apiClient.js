import axios from 'axios'
import { shipperSessionExpired, clearShipperSession } from './idleSession'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
})

// Interceptor untuk menambahkan token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('shipper_token')
  if (token && shipperSessionExpired()) {
    clearShipperSession()
    window.dispatchEvent(new Event('shipper:auth-expired'))
    return Promise.reject(new axios.CanceledError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'))
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor untuk response
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      clearShipperSession()
      window.dispatchEvent(new Event('shipper:auth-expired'))
    }
    throw error.response?.data || error.message
  }
)

export default apiClient
