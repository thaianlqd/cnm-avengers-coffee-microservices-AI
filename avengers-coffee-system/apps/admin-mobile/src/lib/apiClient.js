import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// API Gateway URL
const API_BASE_URL = 'http://192.168.100.41:3000/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

// Store auth token
let authToken = null

// Request interceptor: Attach token
apiClient.interceptors.request.use(
  async (config) => {
    if (!authToken) {
      try {
        const token = await AsyncStorage.getItem('auth_token')
        if (token) {
          authToken = token
        }
      } catch (error) {
        console.error('Failed to get token from storage:', error)
      }
    }
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor: Handle errors
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token
      authToken = null
      AsyncStorage.removeItem('auth_token')
    }
    return Promise.reject(error)
  },
)

export function setAuthToken(token) {
  authToken = token
}

export function clearAuthToken() {
  authToken = null
}

export default apiClient
