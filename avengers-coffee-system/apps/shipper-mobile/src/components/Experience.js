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

export function Header({ title, onBack, right }) {
  return <View style={ui.header}>{onBack && <IconButton name="arrow-back" label="Quay lại" onPress={onBack} />}<View style={{ flex: 1, minWidth: 0 }}><Text style={ui.title}>{title}</Text></View>{right}</View>
}

export function IconButton({ name, label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.icon, pressed && { backgroundColor: colors.primaryBg }, disabled && { opacity: .4 }]}><Ionicons name={name} size={21} color={colors.text} /></Pressable>
}

export function Button({ label, icon, onPress, secondary, disabled, busy }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [ui.button, secondary && { backgroundColor: colors.primaryBg, borderWidth: 1, borderColor: colors.primaryLight }, (disabled || busy) && { opacity: .45 }, pressed && { opacity: .85 }]}>{icon && <Ionicons name={icon} size={18} color={secondary ? colors.primary : '#fff'} />}<Text style={{ fontWeight: '600', fontSize: 14, color: secondary ? colors.primary : '#fff', textAlign: 'center', flexShrink: 1 }}>{busy ? 'Đang xử lý…' : label}</Text></Pressable>
}

export function EmptyState({ icon = 'cube-outline', title, description, retry }) {
  return <Reveal style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={34} color={colors.primary} /></View><Text style={ui.heading}>{title}</Text>{description ? <Text style={[ui.caption, { textAlign: 'center', lineHeight: 20 }]}>{description}</Text> : null}{retry && <Button label="Thử lại" secondary icon="refresh-outline" onPress={retry} />}</Reveal>
}

/**
 * Khối cơ bản cho Skeleton với hiệu ứng mờ sáng (Pulsating Shimmer)
 */
export function SkeletonBlock({ width, height, borderRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    let mounted = true
    let loop
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced || !mounted) return
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.95, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: Platform.OS !== 'web' })
        ])
      )
      loop.start()
    }).catch(() => {})
    return () => {
      mounted = false
      loop?.stop()
    }
  }, [opacity])

  return (
    <Animated.View
      style={[
        {
          width: width || '100%',
          height: height || 16,
          borderRadius,
          backgroundColor: '#e2e8f0',
          opacity,
        },
        style,
      ]}
    />
  )
}

/**
 * Skeleton danh sách đơn hàng cho Shipper
 */
export function Skeleton({ count = 3 }) {
  return (
    <View accessibilityLabel="Đang tải dữ liệu" style={{ padding: 16, gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={ui.skeletonCard}>
          {/* Header mã đơn & trạng thái */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SkeletonBlock width={110} height={18} borderRadius={6} />
            <SkeletonBlock width={80} height={20} borderRadius={10} />
          </View>

          {/* Điểm lấy hàng */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <SkeletonBlock width={10} height={10} borderRadius={5} style={{ backgroundColor: '#94a3b8' }} />
            <SkeletonBlock width="75%" height={14} borderRadius={5} />
          </View>

          {/* Đường nối */}
          <View style={{ width: 2, height: 12, backgroundColor: '#cbd5e1', marginLeft: 4, marginBottom: 4 }} />

          {/* Điểm giao hàng */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <SkeletonBlock width={10} height={10} borderRadius={5} style={{ backgroundColor: '#ef4444' }} />
            <SkeletonBlock width="88%" height={14} borderRadius={5} />
          </View>

          {/* Chân thẻ: Tiền công & Nút nhận */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
            <SkeletonBlock width={90} height={16} borderRadius={6} />
            <SkeletonBlock width={105} height={36} borderRadius={10} style={{ backgroundColor: '#cbd5e1' }} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function ShipperHomeSkeleton({ topInset = 44 }) {
  return <View accessibilityLabel="Đang tải công việc" style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ backgroundColor: colors.primaryDark, paddingTop: topInset + 16, paddingHorizontal: 18, paddingBottom: 28, gap: 12 }}>
      <SkeletonBlock width={160} height={24} style={{ backgroundColor: '#e8b5ba' }} />
      <SkeletonBlock width={230} height={14} style={{ backgroundColor: '#e8b5ba' }} />
    </View>
    <View style={{ padding: 16, gap: 16, flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}><SkeletonBlock width="48%" height={100} borderRadius={16} /><SkeletonBlock width="48%" height={100} borderRadius={16} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><SkeletonBlock width={115} height={20} /><SkeletonBlock width={95} height={20} /></View>
      <View style={{ flexDirection: 'row', gap: 10 }}><SkeletonBlock width="30%" height={38} borderRadius={12} /><SkeletonBlock width="30%" height={38} borderRadius={12} /><SkeletonBlock width="30%" height={38} borderRadius={12} /></View>
      <Skeleton count={2} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.borderLight }}>
      {Array.from({ length: 4 }, (_, i) => <View key={i} style={{ alignItems: 'center', gap: 6 }}><SkeletonBlock width={22} height={22} borderRadius={11} /><SkeletonBlock width={42} height={10} /></View>)}
    </View>
  </View>
}

export function TransactionSkeleton({ count = 3 }) {
  return <View accessibilityLabel="Đang tải giao dịch" style={{ gap: 8 }}>
    {Array.from({ length: count }, (_, i) => <View key={i} style={[ui.skeletonCard, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }]}>
      <SkeletonBlock width={38} height={38} borderRadius={19} />
      <View style={{ flex: 1, gap: 6 }}><SkeletonBlock width="70%" height={14} /><SkeletonBlock width="45%" height={11} /></View>
      <SkeletonBlock width={72} height={18} />
    </View>)}
  </View>
}

export function WalletSkeleton() {
  return <View accessibilityLabel="Đang tải ví Shipper" style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 18 }}>
    <View style={{ backgroundColor: colors.primary, borderRadius: 18, padding: 20, gap: 14 }}>
      <SkeletonBlock width={130} height={16} style={{ backgroundColor: '#e8b5ba' }} />
      <SkeletonBlock width={190} height={36} style={{ backgroundColor: '#e8b5ba' }} />
      <View style={{ flexDirection: 'row', gap: 12 }}><SkeletonBlock width="45%" height={50} style={{ backgroundColor: '#e8b5ba' }} /><SkeletonBlock width="45%" height={50} style={{ backgroundColor: '#e8b5ba' }} /></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 12 }}><SkeletonBlock width="48%" height={85} borderRadius={14} /><SkeletonBlock width="48%" height={85} borderRadius={14} /></View>
    <SkeletonBlock width={180} height={22} />
    <TransactionSkeleton count={3} />
  </View>
}

export function ReportSkeleton() {
  return <View accessibilityLabel="Đang tải báo cáo thu nhập" style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16 }}>
    <View style={[ui.skeletonCard, { gap: 12 }]}><SkeletonBlock width={130} height={16} /><SkeletonBlock width={190} height={32} /><View style={{ flexDirection: 'row', gap: 10 }}><SkeletonBlock width="30%" height={50} /><SkeletonBlock width="30%" height={50} /><SkeletonBlock width="30%" height={50} /></View></View>
    <View style={[ui.skeletonCard, { gap: 12 }]}><SkeletonBlock width={150} height={18} /><SkeletonBlock width="100%" height={165} borderRadius={10} /></View>
    <TransactionSkeleton count={2} />
  </View>
}

/**
 * Skeleton toàn màn hình chi tiết đơn hàng Shipper
 */
export function OrderDetailSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 14 }}>
      {/* Tiêu đề & Trạng thái */}
      <View style={[ui.skeletonCard, { gap: 10 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonBlock width={130} height={22} borderRadius={6} />
          <SkeletonBlock width={95} height={24} borderRadius={12} />
        </View>
        <SkeletonBlock width="60%" height={14} borderRadius={5} />
      </View>

      {/* Hành trình giao nhận */}
      <View style={[ui.skeletonCard, { gap: 14 }]}>
        <SkeletonBlock width={140} height={16} borderRadius={6} />
        <View style={{ gap: 10, paddingVertical: 4 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SkeletonBlock width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBlock width="50%" height={14} borderRadius={4} />
              <SkeletonBlock width="95%" height={12} borderRadius={4} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SkeletonBlock width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBlock width="45%" height={14} borderRadius={4} />
              <SkeletonBlock width="90%" height={12} borderRadius={4} />
            </View>
          </View>
        </View>
      </View>

      {/* Thông tin món và tiền */}
      <View style={[ui.skeletonCard, { gap: 12 }]}>
        <SkeletonBlock width={120} height={16} borderRadius={6} />
        <SkeletonBlock width="100%" height={32} borderRadius={8} />
        <SkeletonBlock width="100%" height={32} borderRadius={8} />
      </View>

      {/* Nút hành động */}
      <View style={{ marginTop: 'auto', paddingTop: 10 }}>
        <SkeletonBlock width="100%" height={48} borderRadius={14} style={{ backgroundColor: '#cbd5e1' }} />
      </View>
    </View>
  )
}

/**
 * Skeleton danh sách lịch sử đơn
 */
export function HistorySkeleton({ count = 4 }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[ui.skeletonCard, { paddingVertical: 14 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SkeletonBlock width={100} height={16} borderRadius={6} />
            <SkeletonBlock width={75} height={18} borderRadius={10} />
          </View>
          <SkeletonBlock width="90%" height={13} borderRadius={4} style={{ marginBottom: 6 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <SkeletonBlock width={80} height={12} borderRadius={4} />
            <SkeletonBlock width={70} height={16} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  )
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#f1f5f9' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text },
  caption: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  skeletonCard: { backgroundColor: '#fff', padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#edf2f7', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  icon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 32, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
})
