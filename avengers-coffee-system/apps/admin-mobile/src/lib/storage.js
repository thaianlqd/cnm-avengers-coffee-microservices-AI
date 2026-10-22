import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_admin_session'
const TOKEN_KEY = 'auth_token'
export const SESSION_IDLE_MS = 30 * 60 * 1000
const ACTIVITY_KEY = 'avengers_admin_last_activity'

export async function saveAdminSession(admin, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ admin, timestamp: Date.now() }))
    const previousToken = await AsyncStorage.getItem(TOKEN_KEY)
    await AsyncStorage.setItem(TOKEN_KEY, token)
    if (previousToken !== token || !await AsyncStorage.getItem(ACTIVITY_KEY)) await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadAdminSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
      if (await adminSessionExpired()) {
        await clearAdminSession()
        return { admin: null, token: null }
      }
      const { admin } = JSON.parse(sessionData)
      return { admin, token }
    }
  } catch (error) {
    console.error('Failed to load session:', error)
  }
  return { admin: null, token: null }
}

export async function clearAdminSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY)
    await AsyncStorage.removeItem(TOKEN_KEY)
    await AsyncStorage.removeItem(ACTIVITY_KEY)
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}

export async function getStoredToken() {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function touchAdminSession() {
  await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

export async function adminSessionExpired() {
  const lastActivity = Number(await AsyncStorage.getItem(ACTIVITY_KEY))
  return !Number.isFinite(lastActivity) || lastActivity <= 0 || lastActivity > Date.now()
    || Date.now() - lastActivity >= SESSION_IDLE_MS
}
