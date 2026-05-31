import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unentwined-johanne-biasedly.ngrok-free.dev'

const defaultHeaders = {}
if (String(API_BASE_URL).includes('ngrok')) {
  defaultHeaders['ngrok-skip-browser-warning'] = 'true'
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: defaultHeaders,
})

let authToken = null

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

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
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