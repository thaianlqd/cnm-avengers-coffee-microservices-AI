import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
export default function ScreenHeader({ title, onBack, right }) {
  const insets = useSafeAreaInsets()
  return <View style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee' }}>
    <Pressable disabled={!onBack} accessibilityLabel={onBack ? "Quay lại" : undefined} onPress={onBack} style={{ padding: 10 }}>{onBack ? <Ionicons name="chevron-back" size={24} color="#242424" /> : <View style={{ width: 24, height: 24 }} />}</Pressable>
    <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#242424' }}>{title}</Text>
    {right || <View style={{ width: 44 }} />}
  </View>
}
