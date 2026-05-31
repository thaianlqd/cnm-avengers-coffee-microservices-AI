import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_user_session'
const TOKEN_KEY = 'auth_token'

export async function saveUserSession(user, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user, timestamp: Date.now() }))
    await AsyncStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadUserSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
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
