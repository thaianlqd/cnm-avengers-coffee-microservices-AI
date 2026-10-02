import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
})

// Interceptor untuk menambahkan token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('shipper_token')
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
      localStorage.removeItem('shipper_token')
      window.location.href = '/login'
    }
    throw error.response?.data || error.message
  }
)

export default apiClient
