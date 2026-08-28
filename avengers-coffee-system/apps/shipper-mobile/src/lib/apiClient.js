import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000')

const TOKEN_KEY = 'shipper_auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
})

let authToken = null

let queuePromise = Promise.resolve()

apiClient.interceptors.request.use(
  async (config) => {
    const priorPromise = queuePromise
    let release
    queuePromise = new Promise((resolve) => { release = resolve })
    config._releaseQueue = release
    
    // Đợi request trước đó hoàn thành (timeout max 10s để tránh kẹt vĩnh viễn)
    await Promise.race([
      priorPromise.catch(() => {}),
      new Promise(res => setTimeout(res, 10000))
    ])

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
  (error) => {
    // Nếu request interceptor có lỗi, phải release queue (nếu có)
    if (error.config?._releaseQueue) error.config._releaseQueue()
    return Promise.reject(error)
  },
)

apiClient.interceptors.response.use(
  (response) => {
    if (response.config?._releaseQueue) {
      response.config._releaseQueue()
      delete response.config._releaseQueue
    }
    return response.data
  },
  async (error) => {
    if (error.config?._releaseQueue) {
      error.config._releaseQueue()
      delete error.config._releaseQueue
    }
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
