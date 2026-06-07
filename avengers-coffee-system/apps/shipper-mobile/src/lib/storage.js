import AsyncStorage from '@react-native-async-storage/async-storage'

const SESSION_KEY = 'avengers_shipper_session'
const TOKEN_KEY = 'shipper_auth_token'

export async function saveShipperSession(shipper, token) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ shipper, timestamp: Date.now() }))
    await AsyncStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    console.error('Failed to save session:', error)
  }
}

export async function loadShipperSession() {
  try {
    const sessionData = await AsyncStorage.getItem(SESSION_KEY)
    const token = await AsyncStorage.getItem(TOKEN_KEY)
    if (sessionData && token) {
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
  } catch (error) {
    console.error('Failed to clear session:', error)
  }
}
