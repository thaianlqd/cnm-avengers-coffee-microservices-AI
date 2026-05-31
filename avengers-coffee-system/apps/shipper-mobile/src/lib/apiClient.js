import axios from 'axios'
import { Platform } from 'react-native'

// For Android Emulator: 10.0.2.2 (special alias for host)
// For iOS Simulator: localhost
// For Physical Device: use PC LAN IP (192.168.100.41)
const fallbackBaseURL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://192.168.100.41:3000'
export const baseURL = process.env.EXPO_PUBLIC_API_URL || fallbackBaseURL
let authToken = null

export function buildApiUrl(path) {
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path || ''}`
  return `${baseURL}${cleanPath}`
}

export const apiClient = axios.create({
  baseURL,
  timeout: 30000,
})

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`
  }
  return config
})

export function setAuthToken(token) {
  authToken = token
}
