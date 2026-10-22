const fallbackLocation = {
  href: 'http://localhost:8081/',
  protocol: 'http:',
  host: 'localhost:8081',
  hostname: 'localhost',
  port: '8081',
  pathname: '/',
  search: '',
  hash: '',
  origin: 'http://localhost:8081',
}

if (typeof globalThis !== 'undefined' && typeof globalThis.location === 'undefined') {
  try {
    globalThis.location = fallbackLocation
  } catch {}
}

if (typeof window !== 'undefined' && typeof window.location === 'undefined') {
  try {
    window.location = fallbackLocation
  } catch {}
}

if (typeof global !== 'undefined' && typeof global.location === 'undefined') {
  try {
    global.location = fallbackLocation
  } catch {}
}

import registerRootComponent from 'expo/src/launch/registerRootComponent'
import App from './App'

registerRootComponent(App)
