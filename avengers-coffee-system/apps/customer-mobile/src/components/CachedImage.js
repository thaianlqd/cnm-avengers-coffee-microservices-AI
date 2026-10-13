import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

export default function CachedImage({ source, resizeMode = 'cover', style, onError, onLoad, onLoadEnd, ...props }) {
  const [failed, setFailed] = useState(false)
  const key = typeof source === 'number' ? String(source) : source?.uri || ''
  useEffect(() => setFailed(false), [key])
  if (failed || !source || (typeof source !== 'number' && !source.uri)) return <View style={[style, { backgroundColor: '#f2f2f2', alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel="Chưa tải được ảnh"><Ionicons name="image-outline" size={24} color={colors.muted} /></View>
  return <Image {...props} source={source} style={style} contentFit={resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : resizeMode}
    cachePolicy="memory-disk" recyclingKey={key} transition={0}
    onLoad={event => { onLoad?.(event); onLoadEnd?.() }} onError={event => { setFailed(true); onError?.(event); onLoadEnd?.() }} />
}
