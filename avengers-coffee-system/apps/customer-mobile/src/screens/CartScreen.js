import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  FlatList,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  formatCurrency,
  getUserId,
  normalizeAddress,
  normalizeCartItem,
  normalizeOrder,
  paymentMethodLabels,
  paymentMethodOptions,
  safeArray,
} from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

const DELIVERY_SLOTS = [
  '07:00 - 08:00',
  '08:00 - 09:00',
  '09:00 - 10:00',
  '10:00 - 11:00',
  '11:00 - 12:00',
  '12:00 - 13:00',
  '13:00 - 14:00',
  '14:00 - 15:00',
  '15:00 - 16:00',
  '16:00 - 17:00',
  '17:00 - 18:00',
  '18:00 - 19:00',
  '19:00 - 20:00',
  '20:00 - 21:00',
  '21:00 - 22:00',
]

const PAYMENT_ICONS = {
  THANH_TOAN_KHI_NHAN_HANG: { icon: 'cash-outline', color: '#22c55e' },
  NGAN_HANG_QR: { icon: 'qr-code-outline', color: '#0ea5e9' },
  VNPAY: { icon: 'card-outline', color: '#dc2626' },
}

function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  return (
    <View style={[styles.cartItem, shadows.xs]}>
      {item.hinh_anh_url ? (
        <Image source={{ uri: item.hinh_anh_url }} style={styles.cartItemImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cartItemImage, styles.cartItemImagePlaceholder]}>
          <Ionicons name="cafe-outline" size={24} color={colors.muted} />
        </View>
      )}

      <View style={styles.cartItemInfo}>
        <View style={styles.cartItemHeader}>
          <Text style={styles.cartItemName} numberOfLines={2}>{item.ten_san_pham}</Text>
          <Pressable onPress={() => onRemove(item.id)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
        </View>

        {item.size ? <Text style={styles.cartItemMeta}>Size: {item.size}</Text> : null}
        {item.toppings && item.toppings.length ? (
          <Text style={styles.cartItemMeta}>Topping: {Array.isArray(item.toppings) ? item.toppings.join(', ') : String(item.toppings)}</Text>
        ) : null}
        {(item.luong_da || item.do_ngot) ? (
          <Text style={styles.cartItemMeta}>Đá: {item.luong_da || 'BT'} · Ngọt: {item.do_ngot || 'BT'}</Text>
        ) : null}
        {item.ghi_chu ? <Text style={[styles.cartItemMeta, { fontStyle: 'italic', color: '#ea8025' }]}>Ghi chú: {item.ghi_chu}</Text> : null}
        <Text style={styles.cartItemPrice}>{formatCurrency(item.gia_ban)}</Text>

        <View style={styles.qtyRow}>
          <Pressable onPress={() => onDecrease(item)} style={styles.qtyBtn}>
            <Ionicons name="remove" size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.qtyValue}>{item.so_luong}</Text>
          <Pressable onPress={() => onIncrease(item)} style={styles.qtyBtn}>
            <Ionicons name="add" size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.qtySubtotal}>{formatCurrency(Number(item.gia_ban) * Number(item.so_luong))}</Text>
        </View>
      </View>
    </View>
  )
}

function SectionCard({ title, icon, children }) {
  return (
    <View style={[styles.sectionCard, shadows.xs]}>
      <View style={styles.sectionCardHeader}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={styles.sectionCardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

export function CartScreen({ navigation }) {
  const { user, activeUserId } = useUser()
  const userId = getUserId(user, activeUserId)
  const queryClient = useQueryClient()
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [deliveryMode, setDeliveryMode] = useState('dung_tai_cho')
  const [manualAddress, setManualAddress] = useState('')
  const [deliverySlot, setDeliverySlot] = useState('18:00 - 19:00')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('THANH_TOAN_KHI_NHAN_HANG')
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState(null)
  const [checkoutResult, setCheckoutResult] = useState(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const bannerAnim = useRef(new Animated.Value(-80)).current

  const cartQuery = useQuery({
    queryKey: ['customer', 'cart', userId],
    queryFn: async () => {
      try {
        const response = await apiClient.get(`/cart/${userId}`)
        const list = safeArray(response).map(normalizeCartItem)
        if (list.length > 0) return list
        const cached = queryClient.getQueryData(['customer', 'cart', userId])
        return safeArray(cached).map(normalizeCartItem)
      } catch (err) {
        const cached = queryClient.getQueryData(['customer', 'cart', userId])
        return safeArray(cached).map(normalizeCartItem)
      }
    },
    enabled: Boolean(userId),
    staleTime: 10 * 1000,
  })

  const addressesQuery = useQuery({
    queryKey: ['customer', 'addresses', userId, 'checkout'],
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/addresses`)
      return safeArray(response).map(normalizeAddress)
    },
    enabled: Boolean(userId),
  })

  const productsQuery = useQuery({
    queryKey: ['customer', 'products', 'recommendations'],
    queryFn: async () => {
      const res = await apiClient.get('/products')
      return safeArray(res)
    },
    staleTime: 60 * 1000,
  })

  const cart = safeArray(cartQuery.data).map(normalizeCartItem)
  const addresses = safeArray(addressesQuery.data)

  const recommendedProducts = useMemo(() => {
    const all = productsQuery.data || []
    return all.filter(p => !cart.some(c => c.ma_san_pham === p.id)).slice(0, 6)
  }, [productsQuery.data, cart])

  useEffect(() => {
    if (selectedAddressId || !addresses.length) return
    const defaultAddress = addresses.find((a) => a.mac_dinh) || addresses[0]
    if (defaultAddress) setSelectedAddressId(defaultAddress.id)
  }, [addresses, selectedAddressId])

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId) || addresses[0] || null,
    [addresses, selectedAddressId]
  )

  const selectedAddressText = selectedAddress?.dia_chi_day_du || manualAddress

  const totalAmount = cart.reduce((sum, item) => sum + Number(item.gia_ban || 0) * Number(item.so_luong || 0), 0)
  const totalItems = cart.reduce((sum, item) => sum + Number(item.so_luong || 0), 0)
  const discountAmount = appliedVoucher ? totalAmount * 0.1 : 0
  const finalAmount = Math.max(0, totalAmount - discountAmount)

  const removeMutation = useMutation({
    mutationFn: async (itemId) => apiClient.delete(`/cart/${itemId}`),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId, 'count'] })

      const oldList = queryClient.getQueryData(['customer', 'cart', userId]) || []
      const itemToRemove = oldList.find(i => String(i.id) === String(itemId) || String(i.ma_san_pham) === String(itemId))
      const removedQty = Number(itemToRemove?.so_luong || 0)

      queryClient.setQueryData(['customer', 'cart', userId], old => {
        const list = Array.isArray(old) ? [...old] : []
        return list.filter(i => String(i.id) !== String(itemId) && String(i.ma_san_pham) !== String(itemId))
      })
      queryClient.setQueryData(['customer', 'cart', userId, 'count'], old => Math.max(0, (Number(old) || 0) - removedQty))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
    onError: () => {},
  })

  const decreaseMutation = useMutation({
    mutationFn: async (item) => {
      if (item.so_luong <= 1) {
        return apiClient.delete(`/cart/${item.id || item.ma_san_pham}`)
      }
      await apiClient.delete(`/cart/${item.id || item.ma_san_pham}`)
      return apiClient.post('/cart', {
        ma_nguoi_dung: userId,
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        gia_ban: item.gia_ban,
        hinh_anh_url: item.hinh_anh_url,
        size: item.size,
        so_luong: item.so_luong - 1,
      })
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId, 'count'] })

      queryClient.setQueryData(['customer', 'cart', userId], old => {
        const list = Array.isArray(old) ? [...old] : []
        const idx = list.findIndex(i => String(i.id) === String(item.id) || Number(i.ma_san_pham) === Number(item.ma_san_pham))
        if (idx >= 0) {
          if (list[idx].so_luong <= 1) {
            list.splice(idx, 1)
          } else {
            list[idx] = { ...list[idx], so_luong: Number(list[idx].so_luong) - 1 }
          }
        }
        return list
      })
      queryClient.setQueryData(['customer', 'cart', userId, 'count'], old => Math.max(0, (Number(old) || 0) - 1))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
    onError: () => {},
  })

  const addMoreMutation = useMutation({
    mutationFn: async (item) => apiClient.post('/cart', {
      ma_nguoi_dung: userId,
      ma_san_pham: item.ma_san_pham,
      ten_san_pham: item.ten_san_pham,
      gia_ban: item.gia_ban,
      hinh_anh_url: item.hinh_anh_url,
      size: item.size,
      so_luong: 1,
    }),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', userId, 'count'] })

      queryClient.setQueryData(['customer', 'cart', userId], old => {
        const list = Array.isArray(old) ? [...old] : []
        const idx = list.findIndex(i => String(i.id) === String(item.id) || Number(i.ma_san_pham) === Number(item.ma_san_pham))
        if (idx >= 0) {
          list[idx] = { ...list[idx], so_luong: Number(list[idx].so_luong) + 1 }
        } else {
          list.push({ ...item, so_luong: 1 })
        }
        return list
      })
      queryClient.setQueryData(['customer', 'cart', userId, 'count'], old => (Number(old) || 0) + 1)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
    onError: () => {},
  })

  const checkoutMutation = useMutation({
    onMutate: () => {
      setPaymentConfirmed(false)
      setCheckoutResult(null)
    },
    mutationFn: async () => {
      if (!selectedAddressText) {
        throw new Error('Chọn hoặc nhập địa chỉ giao hàng trước khi thanh toán.')
      }
      return apiClient.post(`/customers/${userId}/thanh-toan/khoi-tao`, {
        phuong_thuc_thanh_toan: paymentMethod,
        dia_chi_giao_hang: selectedAddressText,
        khung_gio_giao: deliverySlot,
        ghi_chu: note,
        ma_khuyen_mai: appliedVoucher?.ma_khuyen_mai || undefined,
        branch_code: undefined,
      })
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'orders', userId] })
      setCheckoutResult(response)
      if (response?.redirect_url && paymentMethod === 'VNPAY') {
        Linking.openURL(response.redirect_url).catch(() => {})
      }
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || 'Không thể thanh toán.'
      Alert.alert('Lỗi thanh toán', message)
    },
  })

  const handleCheckout = () => {
    if (!cart.length) {
      Alert.alert('Giỏ hàng trống', 'Thêm món vào giỏ trước khi thanh toán.')
      return
    }
    if (!selectedAddressText) {
      Alert.alert('Thiếu địa chỉ', 'Vui lòng chọn hoặc nhập địa chỉ giao hàng.')
      return
    }
    Alert.alert(
      'Xác nhận đặt hàng',
      `${totalItems} món · ${formatCurrency(finalAmount)}\nGiao đến: ${selectedAddressText}\nKhung giờ: ${deliverySlot}\nThanh toán: ${paymentMethodLabels[paymentMethod] || paymentMethod}`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đặt hàng', onPress: () => checkoutMutation.mutate() },
      ]
    )
  }

  // Auto-poll order payment status after checkout
  const orderStatusQuery = useQuery({
    queryKey: ['customer', 'order-status', checkoutResult?.don_hang?.ma_don_hang],
    queryFn: async () => {
      const orderId = String(checkoutResult?.don_hang?.ma_don_hang || checkoutResult?.don_hang?.id || '').trim()
      if (!orderId) return null
      const res = await apiClient.get(`/customers/${userId}/orders?status=all&_t=${Date.now()}`)
      const orders = safeArray(res).map(normalizeOrder)
      return orders.find(o => o.ma_don_hang === orderId || o.id === orderId) || null
    },
    enabled: Boolean(checkoutResult?.don_hang?.ma_don_hang) && !paymentConfirmed,
    refetchInterval: 3000,
    staleTime: 0,
    gcTime: 0,
  })

  // Fallback: poll notifications to see if payment success was received (since order cache might be delayed)
  const notificationsQuery = useQuery({
    queryKey: ['customer', 'notifications-polling', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/notifications?limit=5&_t=${Date.now()}`)
      return response
    },
    enabled: Boolean(checkoutResult?.don_hang?.ma_don_hang) && !paymentConfirmed,
    refetchInterval: 3000,
  })

  useEffect(() => {
    const status = orderStatusQuery.data?.trang_thai_thanh_toan
    const isCod = paymentMethod === 'THANH_TOAN_KHI_NHAN_HANG'
    
    // Check notifications as fallback
    const notifs = safeArray(notificationsQuery.data?.items || notificationsQuery.data)
    const orderId = String(checkoutResult?.don_hang?.ma_don_hang || checkoutResult?.don_hang?.id || '').trim()
    const hasPaymentNotif = orderId && notifs.some(n => 
      n.loai === 'PAYMENT' && 
      n.du_lieu?.ma_don_hang === orderId && 
      String(n.tieu_de).toLowerCase().includes('thanh cong')
    )

    if ((isCod || status === 'DA_THANH_TOAN' || hasPaymentNotif) && !paymentConfirmed) {
      setPaymentConfirmed(true)
      Animated.spring(bannerAnim, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start()
    }
  }, [orderStatusQuery.data?.trang_thai_thanh_toan, paymentMethod, paymentConfirmed, notificationsQuery.data, checkoutResult])

  // Success state
  if (checkoutResult && !checkoutMutation.isPending) {
    const isCod = paymentMethod === 'THANH_TOAN_KHI_NHAN_HANG'
    const isSuccess = isCod || paymentConfirmed || orderStatusQuery.data?.trang_thai_thanh_toan === 'DA_THANH_TOAN'

    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.successHeader}>
          <Text style={styles.successHeaderTitle}>Đặt hàng thành công!</Text>
        </LinearGradient>

        {/* Payment Success Banner */}
        <Animated.View style={[
          styles.paymentBanner,
          isSuccess ? styles.paymentBannerSuccess : styles.paymentBannerPending,
          { transform: [{ translateY: isSuccess ? bannerAnim : 0 }] },
        ]}>
          <Ionicons
            name={isSuccess ? 'checkmark-circle' : 'time-outline'}
            size={20}
            color={isSuccess ? '#fff' : '#92400e'}
          />
          <Text style={[
            styles.paymentBannerText,
            isSuccess ? styles.paymentBannerTextSuccess : styles.paymentBannerTextPending,
          ]}>
            {isCod ? '✅ Đặt hàng thành công!' : (isSuccess ? '✅ Thanh toán thành công!' : '⏳ Đang chờ thanh toán...')}
          </Text>
        </Animated.View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.successContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Đơn hàng đã được khởi tạo</Text>
            <Text style={styles.successMessage}>{checkoutResult?.message || 'Cảm ơn bạn đã đặt hàng!'}</Text>
            {checkoutResult?.don_hang?.ma_don_hang ? (
              <View style={styles.orderCodeWrap}>
                <Text style={styles.orderCodeLabel}>Mã đơn hàng</Text>
                <Text style={styles.orderCode}>{checkoutResult.don_hang.ma_don_hang}</Text>
              </View>
            ) : null}

            {/* Payment Status Badge */}
            <View style={[styles.paymentStatusBadge, isSuccess ? styles.paymentStatusPaid : styles.paymentStatusWaiting]}>
              <Ionicons
                name={isSuccess ? 'checkmark-circle' : 'hourglass-outline'}
                size={16}
                color={isSuccess ? '#22c55e' : '#f59e0b'}
              />
              <Text style={[styles.paymentStatusText, { color: isSuccess ? '#22c55e' : '#f59e0b' }]}>
                {isCod ? 'Thanh toán khi nhận hàng' : (isSuccess ? 'Đã thanh toán' : 'Chờ thanh toán')}
              </Text>
            </View>

            {checkoutResult?.payment_details?.qr_img_url && !isSuccess ? (
              <View style={styles.qrWrap}>
                <Text style={styles.qrLabel}>Quét mã QR để thanh toán</Text>
                <Image
                  source={{ uri: checkoutResult.payment_details.qr_img_url }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>

          {/* View Invoice Button */}
          {isSuccess ? (
            <Pressable
              onPress={() => {
                setCheckoutResult(null)
                setPaymentConfirmed(false)
                navigation.navigate('Orders')
              }}
              style={styles.invoiceBtn}
            >
              <View style={styles.invoiceBtnInner}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={styles.invoiceBtnText}>Xem hóa đơn trong Đơn hàng</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </View>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => {
              setCheckoutResult(null)
              setPaymentConfirmed(false)
              navigation.navigate('Orders')
            }}
            style={styles.viewOrdersBtn}
          >
            <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.viewOrdersBtnGradient}>
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={styles.viewOrdersBtnText}>Xem đơn hàng</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => { setCheckoutResult(null); setPaymentConfirmed(false) }} style={styles.continueShoppingBtn}>
            <Text style={styles.continueShoppingText}>Tiếp tục mua sắm</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView 
      style={styles.screenClean} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header */}
      <View style={styles.headerClean}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBtnClean}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </Pressable>
        <Text style={styles.headerTitleClean}>Xác nhận đơn hàng</Text>
        <Pressable onPress={() => navigation.navigate('Profile')} style={styles.headerBtnClean}>
          <Ionicons name="person-circle-outline" size={26} color="#1e293b" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.contentClean}
        contentContainerStyle={styles.contentPaddingClean}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Loading */}
        {cartQuery.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#ea8025" size="large" />
            <Text style={styles.loadingText}>Đang tải giỏ hàng...</Text>
          </View>
        ) : null}

        {/* Empty Cart */}
        {!cartQuery.isLoading && !cart.length ? (
          <View style={styles.emptyContainerClean}>
            <Ionicons name="bag-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitleClean}>Giỏ hàng đang trống</Text>
            <Text style={styles.emptyTextClean}>Thêm sản phẩm từ menu để bắt đầu đặt hàng.</Text>
            <Pressable
              onPress={() => navigation.navigate('Menu')}
              style={styles.emptyBtnClean}
            >
              <Text style={styles.emptyBtnTextClean}>Khám phá Menu</Text>
            </Pressable>
          </View>
        ) : null}

        {cart.length > 0 ? (
          <>
            {/* Delivery Mode Tabs */}
            <View style={styles.deliveryModeRow}>
              {[
                { id: 'giao_hang', label: 'Giao hàng tận nơi' },
                { id: 'lay_tai_quan', label: 'Lấy tại quán' },
                { id: 'dung_tai_cho', label: 'Dùng tại chỗ' },
              ].map((mode) => {
                const active = deliveryMode === mode.id
                return (
                  <Pressable
                    key={mode.id}
                    style={[styles.deliveryModeTab, active && styles.deliveryModeTabActive]}
                    onPress={() => setDeliveryMode(mode.id)}
                  >
                    <Text style={[styles.deliveryModeText, active && styles.deliveryModeTextActive]}>
                      {mode.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Store info & Delivery Time card */}
            <View style={styles.checkoutInfoCard}>
              <Pressable
                style={styles.checkoutInfoRow}
                onPress={() => {
                  if (addresses.length > 0) {
                    Alert.alert('Chọn địa chỉ', '', addresses.map(a => ({
                      text: a.ten_dia_chi || a.dia_chi_day_du,
                      onPress: () => setSelectedAddressId(a.id)
                    })).concat([{ text: 'Hủy', style: 'cancel' }]))
                  }
                }}
              >
                <Ionicons
                  name={deliveryMode === 'dung_tai_cho' ? 'location-sharp' : 'map-outline'}
                  size={20}
                  color="#64748b"
                  style={styles.checkoutInfoIcon}
                />
                <View style={styles.checkoutInfoContent}>
                  <Text style={styles.checkoutInfoTitle}>
                    {deliveryMode === 'dung_tai_cho' ? 'Dùng tại chỗ' : deliveryMode === 'lay_tai_quan' ? 'Lấy tại quán' : 'Giao hàng đến'}
                  </Text>
                  <Text style={styles.checkoutInfoSubtitle} numberOfLines={1}>
                    {deliveryMode === 'giao_hang' ? (selectedAddressText || 'Nhập địa chỉ giao hàng bên dưới') : 'NTR Gold Coast'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#ef4444" />
              </Pressable>

              <View style={styles.checkoutInfoDivider} />

              <Pressable
                style={styles.checkoutInfoRow}
                onPress={() => {
                  Alert.alert('Khung giờ giao', 'Chọn thời gian:', DELIVERY_SLOTS.slice(0, 5).map(s => ({
                    text: s,
                    onPress: () => setDeliverySlot(s)
                  })).concat([{ text: 'Hủy', style: 'cancel' }]))
                }}
              >
                <Ionicons name="time-outline" size={20} color="#64748b" style={styles.checkoutInfoIcon} />
                <View style={styles.checkoutInfoContent}>
                  <Text style={styles.checkoutInfoTitle}>Tùy chọn thời gian giao hàng</Text>
                  <Text style={styles.checkoutInfoSubtitle} numberOfLines={1}>
                    2026-07-15, Càng sớm càng tốt ({deliverySlot})
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#ef4444" />
              </Pressable>
            </View>

            {/* Cart Items Section */}
            <View style={styles.sectionContainerClean}>
              <Text style={styles.sectionTitleClean}>Giỏ hàng của bạn</Text>
              <View style={styles.cartListClean}>
                {cart.map((item, index) => (
                  <View key={item.id || item.ma_san_pham || index} style={styles.cartItemRowClean}>
                    {item.hinh_anh_url ? (
                      <Image source={{ uri: item.hinh_anh_url }} style={styles.cartItemImgClean} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cartItemImgClean, styles.cartItemImgPlaceholderClean]}>
                        <Ionicons name="cafe-outline" size={22} color="#94a3b8" />
                      </View>
                    )}
                    <View style={styles.cartItemInfoClean}>
                      <Text style={styles.cartItemNameClean} numberOfLines={2}>{item.ten_san_pham}</Text>
                      <Text style={styles.cartItemSizeClean}>
                        Size {item.size || 'Nhỏ'}
                        {item.toppings && item.toppings.length ? ` + ${Array.isArray(item.toppings) ? item.toppings.join(', ') : String(item.toppings)}` : ''}
                      </Text>
                      {(item.luong_da || item.do_ngot) ? (
                        <Text style={[styles.cartItemSizeClean, { fontSize: 11, color: '#64748b', marginTop: 1 }]}>
                          Đá: {item.luong_da || 'BT'} · Ngọt: {item.do_ngot || 'BT'}
                        </Text>
                      ) : null}
                      {item.ghi_chu ? (
                        <Text style={[styles.cartItemSizeClean, { fontSize: 11, fontStyle: 'italic', color: '#ea8025', marginTop: 1 }]}>
                          Ghi chú: {item.ghi_chu}
                        </Text>
                      ) : null}
                      <Text style={styles.cartItemPriceClean}>{formatCurrency(item.gia_ban)}</Text>
                    </View>
                    <View style={styles.qtyControlClean}>
                      <Pressable onPress={() => decreaseMutation.mutate(item)} style={styles.qtyBtnClean}>
                        <Text style={styles.qtyBtnTextClean}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValueClean}>{item.so_luong}</Text>
                      <Pressable onPress={() => addMoreMutation.mutate(item)} style={styles.qtyBtnClean}>
                        <Text style={styles.qtyBtnTextClean}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Upsell / Recommendations */}
            <View style={styles.sectionContainerClean}>
              <Text style={styles.sectionTitleClean}>Gợi ý dùng kèm</Text>
              <Text style={styles.sectionSubtitleClean}>Thêm cùng giỏ hàng hiện tại - lựa chọn phổ biến</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recomScrollContainer}>
                {(recommendedProducts.length > 0 ? recommendedProducts : [
                  { id: 'rec1', ten_san_pham: 'Wafu Pasta Heo Nướng Xốt Shoyu', gia_ban: 69000, hinh_anh_url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=300' },
                  { id: 'rec2', ten_san_pham: 'Wafu Pasta Bò Bằm Xốt Bolognese', gia_ban: 59000, hinh_anh_url: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281298?w=300' },
                  { id: 'rec3', ten_san_pham: 'Bánh Mì Que Bò Nắm Xốt Bơ', gia_ban: 22000, hinh_anh_url: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=300' },
                ]).map((p, idx) => (
                  <View key={p.id || idx} style={styles.recomCardClean}>
                    <View style={styles.recomCardTop}>
                      {p.hinh_anh_url ? (
                        <Image source={{ uri: p.hinh_anh_url }} style={styles.recomImgClean} resizeMode="cover" />
                      ) : (
                        <View style={[styles.recomImgClean, styles.cartItemImgPlaceholderClean]}>
                          <Ionicons name="fast-food-outline" size={24} color="#94a3b8" />
                        </View>
                      )}
                      <View style={styles.recomInfoClean}>
                        <Text style={styles.recomNameClean} numberOfLines={2}>{p.ten_san_pham}</Text>
                        <Text style={styles.recomOldPriceClean}>{formatCurrency(Number(p.gia_ban) + 10000)}</Text>
                      </View>
                    </View>
                    <Pressable
                      style={styles.recomAddBtnClean}
                      onPress={() => addMoreMutation.mutate({
                        ma_san_pham: p.id || `rec_${idx}`,
                        ten_san_pham: p.ten_san_pham,
                        gia_ban: p.gia_ban,
                        hinh_anh_url: p.hinh_anh_url,
                        size: 'Vừa',
                      })}
                    >
                      <Text style={styles.recomAddTextClean}>{formatCurrency(p.gia_ban)}  Thêm ›</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.feedbackPillClean}>
                <Text style={styles.feedbackTextClean}>⭐ Hợp gu?</Text>
                <Pressable style={styles.feedbackBtnClean} onPress={() => Alert.alert('Cảm ơn', 'Chúng tôi ghi nhận ý kiến của bạn!')}>
                  <Text style={styles.feedbackEmojiClean}>👍</Text>
                </Pressable>
                <Pressable style={styles.feedbackBtnClean} onPress={() => Alert.alert('Cảm ơn', 'Chúng tôi sẽ cải thiện gợi ý!')}>
                  <Text style={styles.feedbackEmojiClean}>👎</Text>
                </Pressable>
              </View>
            </View>

            {/* Vouchers Section */}
            <View style={styles.sectionContainerClean}>
              <View style={styles.sectionHeaderRowClean}>
                <Text style={styles.sectionTitleClean}>Mã giảm giá</Text>
                <Pressable onPress={() => Alert.alert('Mã giảm giá', 'Bạn đang có ưu đãi Miễn phí Upsize và Giảm 20%!')}>
                  <Text style={styles.sectionLinkClean}>Tất cả mã ›</Text>
                </Pressable>
              </View>
              <View style={styles.voucherCardClean}>
                <View style={styles.voucherBadgeLeftClean}>
                  <Text style={styles.voucherBadgeTextClean}>MIỄN PHÍ</Text>
                  <Text style={styles.voucherBadgeSubClean}>UPSIZE</Text>
                </View>
                <View style={styles.voucherInfoClean}>
                  <Text style={styles.voucherTitleClean}>Miễn phí Upsize BST Trà Shan/Americano mới</Text>
                  <Text style={styles.voucherSubClean}>Còn 17 ngày</Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (!appliedVoucher) {
                      setAppliedVoucher({ ma_khuyen_mai: 'UPSIZE_FREE' })
                      Alert.alert('Thành công', 'Đã áp dụng ưu đãi Miễn phí Upsize!')
                    } else {
                      setAppliedVoucher(null)
                    }
                  }}
                  style={styles.voucherUseContainer}
                >
                  <Text style={styles.voucherUseBtnClean}>{appliedVoucher ? 'Đang dùng' : 'Dùng'}</Text>
                </Pressable>
              </View>
            </View>

            {/* Input Fields */}
            <View style={styles.sectionContainerClean}>
              {deliveryMode === 'giao_hang' ? (
                <>
                  <TextInput
                    value={manualAddress}
                    onChangeText={setManualAddress}
                    placeholder="Địa chỉ giao hàng (Số nhà, đường, phường/xã...)"
                    placeholderTextColor="#94a3b8"
                    style={styles.inputClean}
                  />
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Ghi chú cho đơn hàng (không bắt buộc)"
                    placeholderTextColor="#94a3b8"
                    style={[styles.inputClean, { marginTop: 10 }]}
                  />
                </>
              ) : (
                <>
                  <TextInput
                    placeholder="Tên người nhận"
                    placeholderTextColor="#94a3b8"
                    defaultValue={user?.name || user?.full_name || 'Khách hàng'}
                    style={styles.inputClean}
                  />
                  <TextInput
                    placeholder="Số điện thoại"
                    placeholderTextColor="#94a3b8"
                    defaultValue={user?.phone || user?.so_dien_thoai || '0912345678'}
                    keyboardType="phone-pad"
                    style={[styles.inputClean, { marginTop: 10 }]}
                  />
                </>
              )}
            </View>

            {/* Payment Method */}
            <View style={styles.sectionContainerClean}>
              <View style={styles.sectionHeaderRowClean}>
                <Text style={styles.sectionTitleClean}>Phương thức thanh toán</Text>
              </View>
              <Pressable
                style={styles.paymentMethodRowClean}
                onPress={() => {
                  Alert.alert('Chọn phương thức thanh toán', '', [
                    { text: '💵 Tiền mặt (khi nhận hàng)', onPress: () => setPaymentMethod('THANH_TOAN_KHI_NHAN_HANG') },
                    { text: '📱 Ngân hàng / QR Code', onPress: () => setPaymentMethod('NGAN_HANG_QR') },
                    { text: '💳 VNPAY', onPress: () => setPaymentMethod('VNPAY') },
                    { text: 'Hủy', style: 'cancel' }
                  ])
                }}
              >
                <View style={styles.paymentMethodLeftClean}>
                  <Ionicons
                    name={paymentMethod === 'NGAN_HANG_QR' ? 'qr-code-outline' : paymentMethod === 'VNPAY' ? 'card-outline' : 'cash-outline'}
                    size={20}
                    color="#22c55e"
                  />
                  <Text style={styles.paymentMethodNameClean}>
                    {paymentMethod === 'NGAN_HANG_QR' ? 'Ngân hàng / QR Code' : paymentMethod === 'VNPAY' ? 'Thẻ VNPAY / ATM' : 'Tiền mặt'}
                  </Text>
                </View>
                <Text style={styles.paymentMethodChangeClean}>Đổi ›</Text>
              </Pressable>
            </View>

            {/* Order Summary Table */}
            <View style={[styles.sectionContainerClean, { marginBottom: 30 }]}>
              <Text style={styles.sectionTitleClean}>Thông tin thanh toán</Text>
              <View style={styles.summaryTableClean}>
                <View style={styles.summaryTableRowClean}>
                  <Text style={styles.summaryTableLabelClean}>Tổng số món</Text>
                  <Text style={styles.summaryTableValClean}>{totalItems}</Text>
                </View>
                <View style={styles.summaryTableRowClean}>
                  <Text style={styles.summaryTableLabelClean}>Tổng giá món</Text>
                  <Text style={styles.summaryTableValClean}>{formatCurrency(totalAmount)}</Text>
                </View>
                {discountAmount > 0 ? (
                  <View style={styles.summaryTableRowClean}>
                    <Text style={[styles.summaryTableLabelClean, { color: '#22c55e' }]}>Giảm giá voucher</Text>
                    <Text style={[styles.summaryTableValClean, { color: '#22c55e' }]}>−{formatCurrency(discountAmount)}</Text>
                  </View>
                ) : null}
                <View style={styles.summaryTableRowClean}>
                  <Text style={styles.summaryTableLabelClean}>Thành tiền</Text>
                  <Text style={styles.summaryTableValClean}>{formatCurrency(finalAmount)}</Text>
                </View>
                <View style={styles.summaryDividerClean} />
                <View style={styles.summaryTableRowClean}>
                  <Text style={styles.summaryTableTotalLabelClean}>Tổng cộng</Text>
                  <Text style={styles.summaryTableTotalValClean}>{formatCurrency(finalAmount)}</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Checkout Bar */}
      {cart.length > 0 ? (
        <View style={styles.bottomBarClean}>
          <Pressable
            onPress={handleCheckout}
            disabled={checkoutMutation.isPending}
            style={styles.bottomCheckoutBtnClean}
          >
            {checkoutMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.bottomCheckoutBtnTextClean}>THANH TOÁN</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    fontWeight: '500',
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addMoreText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: spacing.md,
    paddingBottom: 140,
    gap: spacing.md,
  },

  // Loading
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },

  // Empty
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  goMenuBtn: {
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  goMenuBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  goMenuBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },

  // Cart Item
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 0,
  },
  cartItemImage: {
    width: 90,
    height: 100,
    backgroundColor: colors.cream,
  },
  cartItemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartItemInfo: {
    flex: 1,
    padding: 12,
  },
  cartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cartItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 20,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartItemMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
    fontWeight: '500',
  },
  cartItemPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  qtySubtotal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: 4,
  },

  // Section Card
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
  },
  summaryTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },

  // Address
  addressList: {
    gap: spacing.sm,
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  addressOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#fff9f5',
  },
  addressOptionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  radioBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioBtnActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  addressOptionInfo: {
    flex: 1,
    gap: 4,
  },
  addressNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  addressName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  defaultBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16a34a',
  },
  addressText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  addressNote: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
  noAddressText: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  manualAddressWrap: {
    gap: spacing.sm,
  },
  manualAddressInput: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Delivery Slots
  slotList: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: 4,
  },
  slotChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  slotTextActive: {
    color: '#fff',
  },
  noteWrap: {
    marginTop: 4,
  },
  noteInput: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Payment
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paymentCard: {
    width: '47%',
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    position: 'relative',
  },
  paymentCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#fff9f5',
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
  },
  paymentDesc: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
  },
  paymentCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },

  // Voucher
  voucherInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  voucherInput: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  voucherApplyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voucherApplyText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  appliedVoucher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  appliedVoucherText: {
    flex: 1,
    fontSize: 13,
    color: colors.success,
    fontWeight: '700',
  },

  // Checkout Footer
  checkoutFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.md,
    paddingBottom: 28,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    ...shadows.lg,
  },
  checkoutSummary: {
    flex: 1,
    gap: 2,
  },
  checkoutTotalLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  checkoutTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  checkoutBtn: {
    flex: 2,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  checkoutBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  // Success
  successHeader: {
    paddingTop: 54,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  successHeaderTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  },
  successContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  successCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  successIcon: {},
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  orderCodeWrap: {
    backgroundColor: '#fff9f5',
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffe0c8',
    width: '100%',
  },
  orderCodeLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  orderCode: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 4,
    letterSpacing: 1,
  },
  vnpayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  vnpayBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  qrWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  qrLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: radius.xl,
    backgroundColor: '#fff',
  },
  viewOrdersBtn: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  viewOrdersBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  viewOrdersBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  continueShoppingBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  continueShoppingText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },

  // Payment Banner
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  paymentBannerSuccess: {
    backgroundColor: '#22c55e',
  },
  paymentBannerPending: {
    backgroundColor: '#fef3c7',
  },
  paymentBannerText: {
    fontSize: 14,
    fontWeight: '900',
  },
  paymentBannerTextSuccess: {
    color: '#fff',
  },
  paymentBannerTextPending: {
    color: '#92400e',
  },

  // Payment Status Badge
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: '100%',
    justifyContent: 'center',
  },
  paymentStatusPaid: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  paymentStatusWaiting: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  paymentStatusText: {
    fontSize: 13,
    fontWeight: '900',
  },

  // Invoice Button
  invoiceBtn: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#ffe0c8',
    overflow: 'hidden',
  },
  invoiceBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  invoiceBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    flex: 1,
  },

  // --- CLEAN TCH CHECKOUT STYLES ---
  screenClean: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 52 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  headerBtnClean: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleClean: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  contentClean: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentPaddingClean: {
    paddingBottom: 120,
  },
  emptyContainerClean: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitleClean: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
  },
  emptyTextClean: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyBtnClean: {
    marginTop: 24,
    backgroundColor: '#ea8025',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnTextClean: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  deliveryModeRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
  },
  deliveryModeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 20,
  },
  deliveryModeTabActive: {
    backgroundColor: '#ea8025',
  },
  deliveryModeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  deliveryModeTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  checkoutInfoCard: {
    marginHorizontal: 16,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  checkoutInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkoutInfoIcon: {
    marginRight: 12,
  },
  checkoutInfoContent: {
    flex: 1,
  },
  checkoutInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  checkoutInfoSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
  checkoutInfoDivider: {
    height: 1,
    backgroundColor: '#f8fafc',
    marginLeft: 32,
  },
  sectionContainerClean: {
    marginTop: 18,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    paddingBottom: 16,
  },
  sectionTitleClean: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
  },
  sectionSubtitleClean: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -6,
    marginBottom: 12,
  },
  sectionHeaderRowClean: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLinkClean: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
  },
  cartListClean: {
    gap: 16,
  },
  cartItemRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartItemImgClean: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: 12,
  },
  cartItemImgPlaceholderClean: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartItemInfoClean: {
    flex: 1,
  },
  cartItemNameClean: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  cartItemSizeClean: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cartItemPriceClean: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d97706',
    marginTop: 2,
  },
  qtyControlClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  qtyBtnClean: {
    paddingHorizontal: 4,
  },
  qtyBtnTextClean: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  qtyValueClean: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  recomScrollContainer: {
    gap: 12,
    paddingVertical: 4,
  },
  recomCardClean: {
    width: 170,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f2f2f2',
    padding: 10,
    justifyContent: 'space-between',
  },
  recomCardTop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  recomImgClean: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  recomInfoClean: {
    flex: 1,
  },
  recomNameClean: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 16,
  },
  recomOldPriceClean: {
    fontSize: 11,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    marginTop: 4,
  },
  recomAddBtnClean: {
    backgroundColor: '#ea8025',
    borderRadius: 16,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recomAddTextClean: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  feedbackPillClean: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  feedbackTextClean: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  feedbackBtnClean: {
    paddingHorizontal: 4,
  },
  feedbackEmojiClean: {
    fontSize: 14,
  },
  voucherCardClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3e8dd',
    padding: 12,
  },
  voucherBadgeLeftClean: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fdba74',
    alignItems: 'center',
    marginRight: 12,
  },
  voucherBadgeTextClean: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ea8025',
  },
  voucherBadgeSubClean: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ea8025',
  },
  voucherInfoClean: {
    flex: 1,
  },
  voucherTitleClean: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  voucherSubClean: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  voucherUseContainer: {
    paddingLeft: 8,
  },
  voucherUseBtnClean: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  inputClean: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  paymentMethodRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  paymentMethodLeftClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentMethodNameClean: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  paymentMethodChangeClean: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
  },
  summaryTableClean: {
    gap: 10,
  },
  summaryTableRowClean: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTableLabelClean: {
    fontSize: 14,
    color: '#64748b',
  },
  summaryTableValClean: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  summaryDividerClean: {
    height: 1,
    backgroundColor: '#f2f2f2',
    marginVertical: 4,
  },
  summaryTableTotalLabelClean: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  summaryTableTotalValClean: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  bottomBarClean: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bottomCheckoutBtnClean: {
    backgroundColor: '#ea8025',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCheckoutBtnTextClean: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
})
