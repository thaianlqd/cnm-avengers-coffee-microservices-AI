import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Sử dụng ngrok URL giống như bên customer-mobile
const API_BASE_URL = 'https://unentwined-johanne-biasedly.ngrok-free.dev'
const TOKEN_KEY = 'shipper_auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
})

let authToken = null

apiClient.interceptors.request.use(
  async (config) => {
    if (!authToken) {
      try {
        authToken = await AsyncStorage.getItem(TOKEN_KEY)
      } catch (error) {
        console.error('Failed to load auth token:', error)
      }
    }
    if (authToken) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${authToken}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      authToken = null
      await AsyncStorage.removeItem(TOKEN_KEY)
    }
    return Promise.reject(error)
  },
)

export async function setAuthToken(token) {
  authToken = token || null
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token)
  }
}

export async function clearAuthToken() {
  authToken = null
  await AsyncStorage.removeItem(TOKEN_KEY)
}

export function getAuthToken() {
  return authToken
}

export default apiClient
