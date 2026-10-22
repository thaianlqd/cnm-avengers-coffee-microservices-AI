import { randomUUID } from 'expo-crypto'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_user_session'
const TOKEN_KEY = 'auth_token'
export const SESSION_IDLE_MS = 30 * 60 * 1000
const ACTIVITY_KEY = 'avengers_user_last_activity'

export async function saveUserSession(user, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user, timestamp: Date.now() }))
    const previousToken = await AsyncStorage.getItem(TOKEN_KEY)
    await AsyncStorage.setItem(TOKEN_KEY, token)
    if (previousToken !== token || !await AsyncStorage.getItem(ACTIVITY_KEY)) await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadUserSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
      const lastActivity = Number(await AsyncStorage.getItem(ACTIVITY_KEY))
      if (!Number.isFinite(lastActivity) || lastActivity <= 0 || lastActivity > Date.now() || Date.now() - lastActivity >= SESSION_IDLE_MS) {
        await clearUserSession()
        return { user: null, token: null }
      }
      const { user } = JSON.parse(sessionData)
      return { user, token }
    }
  } catch (error) {
    console.error('Failed to load session:', error)
  }
  return { user: null, token: null }
}

export async function clearUserSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY)
    await AsyncStorage.removeItem(TOKEN_KEY)
    await AsyncStorage.removeItem(ACTIVITY_KEY)
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}

export async function touchUserSession() {
  await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

export async function userSessionExpired() {
  const lastActivity = Number(await AsyncStorage.getItem(ACTIVITY_KEY))
  return !Number.isFinite(lastActivity) || lastActivity <= 0 || lastActivity > Date.now() || Date.now() - lastActivity >= SESSION_IDLE_MS
}

export async function getStoredToken() {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function getGuestUserId() {
  const key = 'avengers_anon_guest_id'
  const current = await AsyncStorage.getItem(key).catch(() => null)
  if (/^anon-[0-9a-f-]{36}$/i.test(current || '')) return current
  const id = `anon-${randomUUID()}`
  await AsyncStorage.setItem(key, id).catch(() => {})
  return id
}
