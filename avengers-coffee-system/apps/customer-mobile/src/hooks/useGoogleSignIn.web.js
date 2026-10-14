import { useEffect, useState } from 'react'

let loadingScript
function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (loadingScript) return loadingScript
  loadingScript = new Promise((resolve, reject) => {
    const existing = document.getElementById('customer-google-sdk')
    const script = existing || document.createElement('script')
    const timer = setTimeout(() => { loadingScript = null; reject(new Error('Chưa tải được Google. Bạn có thể dùng email.')) }, 15000)
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); loadingScript = null; script.remove(); reject(new Error('Chưa tải được Google. Bạn có thể dùng email.')) }
    if (!existing) { script.id = 'customer-google-sdk'; script.src = 'https://accounts.google.com/gsi/client'; script.async = true; document.head.appendChild(script) }
  })
  return loadingScript
}
export default function useGoogleSignIn() {
  const id = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '')
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(Boolean(id))
  useEffect(() => {
    let alive = true
    if (id) loadGoogle().then(() => { if (alive) setReady(true) }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])
  const signIn = () => new Promise((resolve, reject) => {
    if (!ready) { reject(new Error('Google chưa sẵn sàng. Bạn có thể dùng email để đăng nhập.')); return }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: id, scope: 'openid email profile',
      callback: response => response.error ? reject(new Error('Chưa xác thực được Google. Bạn hãy thử lại.')) : response.access_token ? resolve(response.access_token) : reject(new Error('Chưa nhận được xác thực Google.')),
      error_callback: error => error.type === 'popup_closed' ? resolve(null) : reject(new Error('Không mở được Google. Bạn hãy cho phép cửa sổ đăng nhập rồi thử lại.')),
    })
    // Execute during the button gesture; no asynchronous wait before opening the popup.
    client.requestAccessToken({ prompt: 'select_account' })
  })
  return { ready, loading, signIn }
}
