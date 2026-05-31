import AsyncStorage from '@react-native-async-storage/async-storage'

const SHIPPER_DATA_KEY = 'shipper_mobile_data'
const SHIPPER_TOKEN_KEY = 'shipper_mobile_token'

export async function loadShipperSession() {
  const [dataJson, token] = await Promise.all([
    AsyncStorage.getItem(SHIPPER_DATA_KEY),
    AsyncStorage.getItem(SHIPPER_TOKEN_KEY),
  ])

  return {
    shipper: dataJson ? JSON.parse(dataJson) : null,
    token: token || null,
  }
}

export async function saveShipperSession(shipper, token) {
  await Promise.all([
    AsyncStorage.setItem(SHIPPER_DATA_KEY, JSON.stringify(shipper)),
    AsyncStorage.setItem(SHIPPER_TOKEN_KEY, token),
  ])
}

export async function clearShipperSession() {
  await Promise.all([
    AsyncStorage.removeItem(SHIPPER_DATA_KEY),
    AsyncStorage.removeItem(SHIPPER_TOKEN_KEY),
  ])
}
