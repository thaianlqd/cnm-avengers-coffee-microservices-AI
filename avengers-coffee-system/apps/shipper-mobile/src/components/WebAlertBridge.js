import React, { useEffect, useState } from 'react'
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { colors } from '../theme'
import { Button, ui } from './Experience'

// React Native's browser Alert is a no-op; keep the same confirmation callbacks.
export function WebAlertBridge() {
  const [dialog, setDialog] = useState(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const previous = Alert.alert
    Alert.alert = (title, message, buttons, options) => setDialog({ title, message, buttons: buttons?.length ? buttons : [{ text: 'Đóng' }], options })
    return () => { Alert.alert = previous }
  }, [])
  if (Platform.OS !== 'web' || !dialog) return null
  const choose = button => { setDialog(null); button?.onPress?.() }
  const dismiss = () => {
    if (dialog.options?.cancelable === false) return
    const cancel = dialog.buttons.find(button => button.style === 'cancel')
    if (!cancel && dialog.buttons.some(button => button.onPress)) return
    setDialog(null)
    cancel?.onPress?.()
    dialog.options?.onDismiss?.()
  }
  return <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
    <View style={{ flex: 1, backgroundColor: 'rgba(16,24,40,.5)', padding: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable accessibilityLabel="Đóng thông báo" onPress={dismiss} style={{ position: 'absolute', inset: 0 }} />
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 420, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' }}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
          <Text accessibilityRole="header" style={ui.title}>{dialog.title}</Text>
          {!!dialog.message && <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>{dialog.message}</Text>}
          <View style={{ gap: 8, marginTop: 8 }}>{dialog.buttons.map((button, index) => <Button key={index} label={button.text || 'Đóng'} secondary={button.style === 'cancel'} onPress={() => choose(button)} />)}</View>
        </ScrollView>
      </View>
    </View>
  </Modal>
}
