import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'
const TOKEN_KEY = 'auth_token'

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

// ─── FormData upload helper (for voice audio) ─────────────────────────────────
// Usage: await apiClient.postForm('/ai/voice-order', formData)
apiClient.postForm = async function postForm(url, formData) {
  const token = authToken || (await AsyncStorage.getItem(TOKEN_KEY).catch(() => null))
  const headers = {
    'Content-Type': 'multipart/form-data',
    'ngrok-skip-browser-warning': 'true',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await axios.post(`${API_BASE_URL}${url}`, formData, {
    headers,
    timeout: 60000,
  })
  return response.data
}