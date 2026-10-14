import { Platform } from 'react-native'
import Constants from 'expo-constants'

const webClientId = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '')
const iosClientId = String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '')
export default function useGoogleSignIn() {
  const preview = Constants.executionEnvironment === 'storeClient'
  const ready = !preview && Boolean(webClientId) && (Platform.OS !== 'ios' || Boolean(iosClientId))
  const signIn = async () => {
    if (!ready) throw new Error('Google chưa khả dụng trong bản ứng dụng này. Bạn có thể dùng email để đăng nhập.')
    // Keep Expo Go bootable: importing the native module there would crash the screen.
    const { GoogleSignin, statusCodes } = await import('@react-native-google-signin/google-signin')
    try {
      GoogleSignin.configure({ webClientId, ...(iosClientId ? { iosClientId } : {}), offlineAccess: false, scopes: ['openid', 'email', 'profile'] })
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const result = await GoogleSignin.signIn()
      if (result.type === 'cancelled') return null
      return (await GoogleSignin.getTokens()).accessToken
    } catch (error) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return null
      if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Bạn hãy cập nhật dịch vụ Google Play rồi thử lại.')
      throw new Error('Chưa đăng nhập được Google. Bạn hãy thử lại hoặc dùng email.')
    }
  }
  return { ready, loading: false, signIn }
}
