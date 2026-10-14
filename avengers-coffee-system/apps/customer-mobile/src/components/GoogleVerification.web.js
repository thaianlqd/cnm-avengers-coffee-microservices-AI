import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Modal from './AppModal'
import { Ionicons } from '@expo/vector-icons'
const siteKey = String(process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || '').trim().replace(/^["']|["']$/g, '')
export const googleVerificationEnabled = Boolean(siteKey) && !siteKey.startsWith('your_')
let loading
function loadCaptcha() {
  if (window.grecaptcha?.render) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit&hl=vi'; script.async = true
    const timeout = setTimeout(() => { loading = null; reject(new Error('Chưa kết nối được xác thực. Bạn thử lại nhé.')) }, 15000)
    script.onload = () => window.grecaptcha.ready(() => { clearTimeout(timeout); resolve() })
    script.onerror = () => { clearTimeout(timeout); script.remove(); loading = null; reject(new Error('Chưa tải được xác thực. Bạn thử lại nhé.')) }
    document.head.appendChild(script)
  })
  return loading
}
function Challenge({ onToken }) {
  const node = useRef(null), [error, setError] = useState(''), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true, widget
    setError(''); setReady(false)
    loadCaptcha().then(() => {
      if (!alive || !node.current) return
      widget = window.grecaptcha.render(node.current, { sitekey: siteKey, size: 'compact', callback: token => { if (alive) onToken(token) }, 'expired-callback': () => { if (alive) onToken('') }, 'error-callback': () => { if (alive) { onToken(''); setError('Xác thực chưa thành công. Bạn thử lại nhé.') } } })
      setReady(true)
    }).catch(failure => { if (alive) setError(failure.message) })
    return () => { alive = false; if (widget !== undefined) { try { window.grecaptcha.reset(widget) } catch {} } }
  }, [attempt, onToken])
  return <View style={{ alignItems: 'center', minHeight: 155, justifyContent: 'center' }}>{!ready && !error && <ActivityIndicator color="#b22830" />}{React.createElement('div', { ref: node, key: attempt })}{error && <Pressable onPress={() => setAttempt(n => n + 1)}><Text style={{ fontSize: 12, lineHeight: 19, textAlign: 'center', color: '#b22830' }}>{error} Chạm để tải lại.</Text></Pressable>}</View>
}
export default function GoogleVerification({ visible, onClose, onContinue }) {
  const [token, setToken] = useState('')
  useEffect(() => { if (!visible) setToken('') }, [visible])
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, padding: 20, justifyContent: 'center' }}><View accessibilityViewIsModal style={{ backgroundColor: '#fff', borderRadius: 22, padding: 22, gap: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 19, fontWeight: '600', color: '#24272d' }}>Tiếp tục với Google</Text><Text style={{ fontSize: 12, color: '#757b84', marginTop: 5 }}>Hai bước đơn giản để kết nối tài khoản</Text></View><Pressable accessibilityLabel="Đóng xác thực Google" onPress={onClose} style={{ padding: 6 }}><Ionicons name="close" size={22} color="#626773" /></Pressable></View>
    <View><Text style={{ fontSize: 13, fontWeight: '600', color: '#343942', marginBottom: 14 }}>1 · Xác nhận bạn không phải robot</Text>{visible && <Challenge onToken={setToken} />}</View>
    <View><Text style={{ fontSize: 13, fontWeight: '600', color: '#343942', marginBottom: 14 }}>2 · Chọn tài khoản Google của bạn</Text><Pressable accessibilityRole="button" accessibilityLabel="Chọn tài khoản Google" disabled={!token} onPress={() => { onClose(); onContinue(token) }} style={{ minHeight: 48, backgroundColor: '#b22830', opacity: token ? 1 : .4, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }}><Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Chọn tài khoản Google</Text></Pressable><Text style={{ fontSize: 10, lineHeight: 16, color: '#8a9099', marginTop: 12 }}>Bạn sẽ chọn tài khoản và xác nhận đăng nhập trong cửa sổ Google.</Text></View>
  </View></View></Modal>
}
