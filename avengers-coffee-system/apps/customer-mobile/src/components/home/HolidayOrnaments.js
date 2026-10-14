import React, { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, Ellipse, Line, RadialGradient, Rect, Stop } from 'react-native-svg'

// Vector highlights preserve sharp edges on Retina displays without large textures.
export default function HolidayOrnaments({ moving }) {
  const sway = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!moving) { sway.setValue(0); return }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(sway, { toValue: 1, duration: 2600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(sway, { toValue: -1, duration: 2600, useNativeDriver: Platform.OS !== 'web' }),
    ]))
    animation.start()
    return () => animation.stop()
  }, [moving, sway])
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.layer}>
    {[['ruby', '#ff8d88', '#c32336', '#590d1a', 20, 9, 58], ['gold', '#fffbe0', '#d9a84c', '#7b471c', 75, 28, 43]].map(([id, light, color, shade, right, top, width]) =>
      <Animated.View key={id} style={{ position: 'absolute', right, top, width, height: width * 1.8, transform: [{ perspective: 500 }, { rotateZ: sway.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] }) }] }}>
        <Svg width="100%" height="100%" viewBox="0 0 80 144">
          <Defs><RadialGradient id={id} cx="30%" cy="27%" r="75%"><Stop offset="0" stopColor={light}/><Stop offset=".35" stopColor={color}/><Stop offset="1" stopColor={shade}/></RadialGradient></Defs>
          <Line x1="40" y1="0" x2="40" y2="65" stroke="#f4dfb3" strokeWidth="1" opacity=".8"/>
          <Rect x="31" y="63" width="18" height="8" rx="2" fill="#e5be75"/>
          <Circle cx="41" cy="108" r="33" fill="#000" opacity=".14"/>
          <Circle cx="40" cy="104" r="33" fill={`url(#${id})`}/>
          <Ellipse cx="29" cy="90" rx="7" ry="10" fill="#fff" opacity=".38" transform="rotate(30 29 90)"/>
          <Circle cx="51" cy="116" r="2" fill="#fff5d5" opacity=".65"/>
        </Svg>
      </Animated.View>)}
  </View>
}
const styles = StyleSheet.create({ layer: { position: 'absolute', top: 110, right: 0, width: 150, height: 150 } })
