// iOS uses Apple Maps. Android standalone builds require a Google Maps key.
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY
  const iosClient = String(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '')
  const iosUrlScheme = iosClient.endsWith('.apps.googleusercontent.com') ? `com.googleusercontent.apps.${iosClient.replace('.apps.googleusercontent.com', '')}` : '' 
  return {
    ...config,
    plugins: [...(config.plugins || []), ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }]] : [])],
    ios: { ...config.ios, bundleIdentifier: config.ios?.bundleIdentifier || 'com.avengers.coffee.customer' },
    android: {
      ...config.android,
      ...(mapsKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } } : {}),
    },
  }
}
