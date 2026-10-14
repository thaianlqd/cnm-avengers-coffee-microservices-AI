import React from 'react'
import { Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
export function AdminChatWidget({ onOpenInbox }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Mở trang tin nhắn khách hàng" onPress={onOpenInbox} style={{ position: 'absolute', bottom: 24, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: '#1671ba', justifyContent: 'center', alignItems: 'center', zIndex: 99, shadowColor: '#1671ba', shadowRadius: 10, shadowOpacity: 0.2, elevation: 4 }}><Ionicons name="chatbubbles-outline" size={25} color="#fff" /></Pressable>
}
