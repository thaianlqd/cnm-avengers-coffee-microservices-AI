import Modal from '../components/AppModal'
import { registerAlertHandler } from '../lib/alert'
import React, { createContext, useContext, useState, useRef, useEffect } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'
const Context = createContext(() => {})
export const errorMessage = error => {
  const message = error?.response?.data?.message || error?.message || 'Chưa thể thực hiện. Vui lòng thử lại.'
  return Array.isArray(message) ? message.join(', ') : String(message)
}
export function FeedbackProvider({ children }) {
  const [notice, setNotice] = useState(null)
  const timer = useRef(null)
  const [dialog, setDialog] = useState(null)
  useEffect(() => registerAlertHandler(setDialog), [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const notify = (message, kind = 'success') => {
    clearTimeout(timer.current); setNotice({ message, kind })
    timer.current = setTimeout(() => setNotice(null), 4200)
  }
  return <Context.Provider value={notify}>{children}{notice && <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: 84, zIndex: 10000 }}>
    <Pressable onPress={() => setNotice(null)} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={{ padding: 14, borderRadius: 12, backgroundColor: '#242424', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Ionicons name={notice.kind === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} color={notice.kind === 'success' ? '#fff' : colors.primaryLight} size={22} />
      <Text style={{ color: '#fff', flex: 1, fontSize: 14, lineHeight: 20 }}>{notice.message}</Text>
      <Ionicons name="close" color="#fff" size={18} />
    </Pressable>
  </View>}{dialog && <Modal visible transparent onRequestClose={() => { if (dialog.options?.cancelable !== false) setDialog(null) }}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}><View style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '85%', padding: 20 }}>
      <ScrollView><Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{dialog.title}</Text><Text style={{ fontSize: 14, lineHeight: 22, color: colors.muted, marginVertical: 16 }}>{dialog.message}</Text></ScrollView>
      <View style={{ gap: 8 }}>{dialog.buttons.map((button, index) => <Pressable key={index} onPress={() => { setDialog(null); button.onPress?.() }} style={{ padding: 13, backgroundColor: button.style === 'cancel' ? '#f4f4f4' : colors.primary, borderRadius: 8 }}><Text style={{ color: button.style === 'cancel' ? colors.text : '#fff', textAlign: 'center', fontWeight: '600' }}>{button.text || 'Đóng'}</Text></Pressable>)}</View>
    </View></View>
  </Modal>}</Context.Provider>
}
export const useFeedback = () => useContext(Context)
