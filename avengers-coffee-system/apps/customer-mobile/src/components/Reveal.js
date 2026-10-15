import React, { useEffect, useRef, useState } from 'react'
import { Animated, AccessibilityInfo, Platform } from 'react-native'
export default function Reveal({ children, visible = true, style }) {
  const progress = useRef(new Animated.Value(0)).current
  const shown = useRef(false)
  useEffect(() => {
    if (!visible || shown.current) return
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted) return
      if (reduced) { progress.setValue(1); shown.current = true }
      else Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => { if (mounted && finished) shown.current = true })
    }).catch(() => { if (mounted) { progress.setValue(1); shown.current = true } })
    return () => { mounted = false; progress.stopAnimation() }
  }, [visible, progress])
  // Virtualized lists already limit rendering. Visibility/motion callbacks must
  // never be a prerequisite for showing or interacting with a product.
  return <Animated.View style={[style, { opacity: 1, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>
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
