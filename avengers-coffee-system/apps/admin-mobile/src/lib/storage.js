import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_admin_session'
const TOKEN_KEY = 'auth_token'

export async function saveAdminSession(admin, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ admin, timestamp: Date.now() }))
    await AsyncStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadAdminSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
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
