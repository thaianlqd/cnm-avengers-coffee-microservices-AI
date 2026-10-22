import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_shipper_session'
const TOKEN_KEY = 'shipper_auth_token'
export const SESSION_IDLE_MS = 30 * 60 * 1000
const ACTIVITY_KEY = 'avengers_shipper_last_activity'

export async function saveShipperSession(shipper, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ shipper, timestamp: Date.now() }))
    const previousToken = await AsyncStorage.getItem(TOKEN_KEY)
    await AsyncStorage.setItem(TOKEN_KEY, token)
    if (previousToken !== token || !await AsyncStorage.getItem(ACTIVITY_KEY)) await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadShipperSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
      const lastActivity = Number(await AsyncStorage.getItem(ACTIVITY_KEY))
      if (!Number.isFinite(lastActivity) || lastActivity <= 0 || lastActivity > Date.now() || Date.now() - lastActivity >= SESSION_IDLE_MS) {
        await clearShipperSession()
        return { shipper: null, token: null }
      }
      const { shipper } = JSON.parse(sessionData)
      return { shipper, token }
    }
  } catch (error) {
    console.error('Failed to load session:', error)
  }
  return { shipper: null, token: null }
}

export async function clearShipperSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY)
    await AsyncStorage.removeItem(TOKEN_KEY)
    await AsyncStorage.removeItem(ACTIVITY_KEY)
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}

export async function touchShipperSession() {
  await AsyncStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

export async function shipperSessionExpired() {
  const lastActivity = Number(await AsyncStorage.getItem(ACTIVITY_KEY))
  return !Number.isFinite(lastActivity) || lastActivity <= 0 || lastActivity > Date.now() || Date.now() - lastActivity >= SESSION_IDLE_MS
}
