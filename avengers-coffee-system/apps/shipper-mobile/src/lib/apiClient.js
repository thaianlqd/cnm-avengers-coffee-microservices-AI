import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform, NativeModules } from 'react-native'

import { resolveShipperEndpoint } from './endpointConfig.mjs'
export function getApiBaseUrl() {
  const isWeb = Platform.OS === 'web'
  const pageUrl = isWeb && typeof window !== 'undefined' && window?.location?.href ? window.location.href : null
  const scriptUrl = NativeModules?.SourceCode?.scriptURL || (NativeModules?.SourceCode?.getConstants ? NativeModules.SourceCode.getConstants()?.scriptURL : null)
  return resolveShipperEndpoint({
    platform: Platform.OS,
    webUrl: process.env.EXPO_PUBLIC_API_URL_WEB,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    pageUrl,
    scriptUrl,
  })
}

export function getSocketUrl() {
  const base = getApiBaseUrl()
  // Order service WebSocket server runs on port 3005
  return base.replace(':3000', ':3005')
}

const API_BASE_URL = getApiBaseUrl()

const TOKEN_KEY = 'shipper_auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
})

let authToken = null

const isNgrok = (API_BASE_URL || '').includes('ngrok')
let queuePromise = Promise.resolve()

apiClient.interceptors.request.use(
  async (config) => {
    const activeBaseUrl = getApiBaseUrl()
    if (!config.baseURL || config.baseURL === API_BASE_URL) {
      config.baseURL = activeBaseUrl
    }

    if (isNgrok) {
      const priorPromise = queuePromise
      let release
      queuePromise = new Promise((resolve) => { release = resolve })
      config._releaseQueue = release
      
      // Đợi request trước đó hoàn thành (timeout max 5s để tránh kẹt)
      await Promise.race([
        priorPromise.catch(() => {}),
        new Promise(res => setTimeout(res, 5000))
      ])
    }

    if (!authToken) {
      try {
        authToken = await AsyncStorage.getItem(TOKEN_KEY)
      } catch (error) {
        console.error('Failed to load auth token:', error)
      }
    }
    if (authToken && config.url !== '/shippers/login') {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${authToken}`
    }
    console.log(`[apiClient] 🚀 ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
    return config
  },
  (error) => {
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
    const fullUrl = `${error.config?.baseURL || ''}${error.config?.url || ''}`
    console.warn(`[apiClient Error] ⚠️ ${error.config?.method?.toUpperCase()} ${fullUrl}: ${error.message}`)
    if (error.response?.status === 401 && error.config?.url !== '/shippers/login') {
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

export { apiClient }
export default apiClient
