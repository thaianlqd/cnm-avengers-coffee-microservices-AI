import React, { useEffect, useRef } from 'react'
import { View, ScrollView, StyleSheet, Animated, AccessibilityInfo, Platform } from 'react-native'
import { colors } from '../theme'

/**
 * Khối cơ bản cho Skeleton với hiệu ứng mờ sáng (Pulsating Shimmer)
 */
export function SkeletonBlock({ width, height, borderRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    let mounted = true
    let loop
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced || !mounted) return
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
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
          backgroundColor: '#e5e7eb',
          opacity,
        },
        style,
      ]}
    />
  )
}

/**
 * Skeleton danh mục tròn ngang (Categories)
 */
export function CategorySkeleton({ count = 5 }) {
  return (
    <View style={styles.categoryRow}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.categoryItem}>
          <SkeletonBlock width={58} height={58} borderRadius={29} />
          <SkeletonBlock width={48} height={12} borderRadius={4} />
        </View>
      ))}
    </View>
  )
}

/**
 * Skeleton thẻ sản phẩm đơn lẻ
 */
export function ProductCardSkeleton({ style }) {
  return (
    <View style={[styles.productCard, style]}>
      <SkeletonBlock width="100%" height={120} borderRadius={10} style={{ marginBottom: 10 }} />
      <SkeletonBlock width="85%" height={14} borderRadius={4} style={{ marginBottom: 6 }} />
      <SkeletonBlock width="60%" height={12} borderRadius={4} style={{ marginBottom: 10 }} />
      <View style={styles.productCardBottom}>
        <SkeletonBlock width="50%" height={16} borderRadius={5} />
        <SkeletonBlock width={28} height={28} borderRadius={14} style={{ backgroundColor: '#d1d5db' }} />
      </View>
    </View>
  )
}

/**
 * Skeleton lưới sản phẩm (Product Grid)
 */
export function ProductGridSkeleton({ count = 4 }) {
  return (
    <View style={styles.productGrid}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </View>
  )
}

export function CustomerHomeSkeleton() {
  return (
    <View accessibilityLabel="Đang tải trang chủ" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <SkeletonBlock width="100%" height={230} borderRadius={0} />
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonBlock width="65%" height={24} />
          <SkeletonBlock width="100%" height={96} borderRadius={12} />
          <View style={{ flexDirection: 'row', gap: 10 }}><SkeletonBlock width="48%" height={72} /><SkeletonBlock width="48%" height={72} /></View>
          <SkeletonBlock width="100%" height={44} borderRadius={22} />
        </View>
        <CategorySkeleton count={4} />
        <View style={{ padding: 16 }}><SkeletonBlock width={180} height={24} /></View>
        <ProductGridSkeleton count={4} />
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderColor: colors.borderLight, backgroundColor: '#fff' }}>
        {Array.from({ length: 5 }, (_, i) => <View key={i} style={{ alignItems: 'center', gap: 5 }}><SkeletonBlock width={24} height={24} borderRadius={12} /><SkeletonBlock width={42} height={10} /></View>)}
      </View>
    </View>
  )
}

export function NewsCardSkeleton({ count = 3 }) {
  return <View accessibilityLabel="Đang tải bài viết" style={{ paddingHorizontal: 16, gap: 14 }}>
    {Array.from({ length: count }, (_, i) => <View key={i} style={styles.card}>
      <SkeletonBlock width="100%" height={count === 1 ? 138 : 160} borderRadius={10} />
      <SkeletonBlock width="72%" height={17} style={{ marginTop: 12 }} />
      <SkeletonBlock width="45%" height={12} style={{ marginTop: 8 }} />
    </View>)}
  </View>
}

export function VoucherListSkeleton({ count = 3 }) {
  return <View accessibilityLabel="Đang tải ưu đãi" style={{ paddingHorizontal: 16, gap: 12 }}>
    {Array.from({ length: count }, (_, i) => <View key={i} style={styles.card}>
      <View style={{ flexDirection: 'row', gap: 12 }}><SkeletonBlock width={76} height={76} borderRadius={12} /><View style={{ flex: 1, gap: 9 }}><SkeletonBlock width="80%" height={17} /><SkeletonBlock width="55%" height={13} /><SkeletonBlock width="40%" height={13} /></View></View>
    </View>)}
  </View>
}

/**
 * Skeleton chi tiết hành trình đơn hàng (Order Tracking / Detail)
 */
export function OrderDetailSkeleton() {
  return (
    <View style={styles.orderDetailWrap}>
      {/* Thẻ tổng quan */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SkeletonBlock width={120} height={20} borderRadius={6} />
          <SkeletonBlock width={90} height={22} borderRadius={11} />
        </View>
        <SkeletonBlock width="70%" height={13} borderRadius={4} />
      </View>

      {/* Bản đồ định vị */}
      <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
        <SkeletonBlock width="100%" height={210} borderRadius={0} />
      </View>

      {/* Thông tin tài xế */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SkeletonBlock width={46} height={46} borderRadius={23} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width="60%" height={16} borderRadius={4} />
            <SkeletonBlock width="40%" height={12} borderRadius={4} />
          </View>
          <SkeletonBlock width={40} height={40} borderRadius={20} />
        </View>
      </View>

      {/* Tiến trình 5 bước */}
      <View style={styles.card}>
        <SkeletonBlock width={140} height={16} borderRadius={5} style={{ marginBottom: 14 }} />
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <SkeletonBlock width={24} height={24} borderRadius={12} />
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBlock width="50%" height={14} borderRadius={4} />
              <SkeletonBlock width="30%" height={10} borderRadius={4} />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * Skeleton danh sách cửa hàng
 */
export function StoreCardSkeleton({ count = 3 }) {
  return (
    <View style={{ paddingHorizontal: 12, gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <SkeletonBlock width="65%" height={16} borderRadius={5} />
            <SkeletonBlock width={55} height={16} borderRadius={8} />
          </View>
          <SkeletonBlock width="90%" height={13} borderRadius={4} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="50%" height={12} borderRadius={4} style={{ marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6, borderTopWidth: 1, borderColor: '#f3f4f6' }}>
            <SkeletonBlock width={90} height={30} borderRadius={8} />
            <SkeletonBlock width={90} height={30} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  categoryItem: {
    width: 68,
    alignItems: 'center',
    gap: 8,
  },
  productGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '44%',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#fff',
  },
  productCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  orderDetailWrap: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    padding: 16,
  },
})
