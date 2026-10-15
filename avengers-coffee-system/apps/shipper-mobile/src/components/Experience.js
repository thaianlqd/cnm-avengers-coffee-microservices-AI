import React, { useEffect, useRef } from 'react'
import { View, Text, Pressable, Animated, AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

export function Reveal({ children, style }) {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced || !mounted) return
      opacity.setValue(0)
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== 'web' }).start()
    }).catch(() => {})
    return () => { mounted = false; opacity.stopAnimation() }
  }, [opacity])
  return <Animated.View style={[style, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }] }]}>{children}</Animated.View>
}
export function Header({ title, subtitle, onBack, right }) {
  return <View style={ui.header}>{onBack && <IconButton name="arrow-back" label="Quay lại" onPress={onBack} />}<View style={{ flex: 1, minWidth: 0 }}><Text style={ui.title}>{title}</Text>{subtitle && <Text style={ui.caption}>{subtitle}</Text>}</View>{right}</View>
}
export function IconButton({ name, label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.icon, pressed && { backgroundColor: colors.primaryBg }, disabled && { opacity: .4 }]}><Ionicons name={name} size={21} color={colors.text} /></Pressable>
}
export function Button({ label, icon, onPress, secondary, disabled, busy }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [ui.button, secondary && { backgroundColor: colors.primaryBg }, (disabled || busy) && { opacity: .45 }, pressed && { opacity: .8 }]}>{icon && <Ionicons name={icon} size={18} color={secondary ? colors.primary : '#fff'} />}<Text style={{ fontWeight: '600', fontSize: 14, color: secondary ? colors.primary : '#fff', textAlign: 'center', flexShrink: 1 }}>{busy ? 'Đang xử lý…' : label}</Text></Pressable>
}
export function EmptyState({ icon = 'file-tray-outline', title, description, retry }) {
  return <Reveal style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={32} color={colors.primary} /></View><Text style={ui.heading}>{title}</Text><Text style={[ui.caption, { textAlign: 'center', lineHeight: 22 }]}>{description}</Text>{retry && <Button label="Thử lại" secondary icon="refresh-outline" onPress={retry} />}</Reveal>
}
export function Skeleton({ count = 3 }) {
  const opacity = useRef(new Animated.Value(.6)).current
  useEffect(() => {
    let mounted = true, loop
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced || !mounted) return
      loop = Animated.loop(Animated.sequence([Animated.timing(opacity,{ toValue: 1, duration: 750, useNativeDriver: Platform.OS !== 'web' }),Animated.timing(opacity,{ toValue: .6, duration: 750, useNativeDriver: Platform.OS !== 'web' })]))
      loop.start()
    }).catch(() => {})
    return () => { mounted = false; loop?.stop() }
  }, [opacity])
  return <Animated.View accessibilityLabel="Đang tải dữ liệu" style={{ padding: 16, gap: 12, opacity }}>{Array.from({ length: count },(_,i) => <View key={i} style={[ui.card, { gap: 14 }]}><View style={{ height: 14, width: '45%', backgroundColor: '#e8ebef', borderRadius: 5 }} /><View style={{ height: 13, width: '90%', backgroundColor: '#eff1f4', borderRadius: 5 }} /><View style={{ height: 13, width: '65%', backgroundColor: '#eff1f4', borderRadius: 5 }} /><View style={{ height: 38, backgroundColor: '#eff1f4', borderRadius: 8 }} /></View>)}</Animated.View>
}
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: colors.borderLight },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  caption: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e9ecf0' },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 48, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 28, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
})
