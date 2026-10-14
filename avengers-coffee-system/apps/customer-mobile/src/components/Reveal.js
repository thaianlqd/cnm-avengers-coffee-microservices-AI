import React, { useEffect, useRef, useState } from 'react'
import { Animated, AccessibilityInfo, Platform } from 'react-native'
export default function Reveal({ children, visible = true, style }) {
  const progress = useRef(new Animated.Value(0)).current
  const shown = useRef(false)
  useEffect(() => {
    if (!visible || shown.current) return
    shown.current = true
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted) return
      if (reduced) progress.setValue(1)
      else Animated.timing(progress, { toValue: 1, duration: 360, useNativeDriver: Platform.OS !== 'web' }).start()
    }).catch(() => progress.setValue(1))
    return () => { mounted = false; progress.stopAnimation() }
  }, [visible, progress])
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{children}</Animated.View>
}
export function useListReveal() {
  const [visible, setVisible] = useState(new Set())
  const onViewableItemsChanged = useRef(({ viewableItems }) => setVisible(previous => {
    const next = new Set(previous)
    viewableItems.forEach(({ item }) => next.add(String(item.id ?? item.ma_san_pham ?? item.ma_chi_nhanh ?? item.ma_don_hang ?? item.ma_voucher ?? item.ma_khuyen_mai)))
    return next
  })).current
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10, minimumViewTime: 30 }).current
  return { visible, onViewableItemsChanged, viewabilityConfig }
}
