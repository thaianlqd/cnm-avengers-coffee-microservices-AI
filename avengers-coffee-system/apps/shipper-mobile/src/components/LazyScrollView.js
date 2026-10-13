import React, { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, View, Animated, AccessibilityInfo, useWindowDimensions } from 'react-native'

const Viewport = createContext({ offset: 0, height: 800 })
export const LazyScrollView = forwardRef(function LazyScrollView({ children, onScroll, ...props }, ref) {
  const { height } = useWindowDimensions()
  const [offset, setOffset] = useState(0)
  return <Viewport.Provider value={{ offset, height }}><ScrollView ref={ref} {...props} scrollEventThrottle={120} onScroll={event => { setOffset(event.nativeEvent.contentOffset.y); onScroll?.(event) }}>{children}</ScrollView></Viewport.Provider>
})
export function LazySection({ children, minHeight = 280, onVisible, style }) {
  const { offset, height } = useContext(Viewport)
  const [y, setY] = useState(null)
  const [visible, setVisible] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const callback = useRef(onVisible)
  callback.current = onVisible
  useEffect(() => {
    if (visible || y == null || y > offset + height + 200) return
    setVisible(true); callback.current?.()
  }, [offset, height, y, visible])
  useEffect(() => {
    if (!visible) return
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!reduced && mounted) { opacity.setValue(0); Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start() }
    }).catch(() => {})
    return () => { mounted = false; opacity.stopAnimation() }
  }, [visible, opacity])
  return <Animated.View onLayout={event => setY(event.nativeEvent.layout.y)} style={[style, { opacity, minHeight: visible ? undefined : minHeight }]}>
    {visible ? children : <View style={{ height: minHeight, margin: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }} />}
  </Animated.View>
}
