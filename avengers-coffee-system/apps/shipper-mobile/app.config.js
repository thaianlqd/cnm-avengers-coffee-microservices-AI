// Android's native Google Maps key is injected at build time; iOS uses Apple Maps.
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, config: { ...config.android?.config,
    ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY ? { googleMaps:{ apiKey:process.env.GOOGLE_MAPS_ANDROID_API_KEY } } : {}) } },
})
