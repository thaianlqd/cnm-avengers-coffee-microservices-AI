import React, { useEffect, useMemo, useState } from 'react'
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
  const { user } = useUser()
  const userId = getUserId(user)
  const queryClient = useQueryClient()
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [deliverySlot, setDeliverySlot] = useState('18:00 - 19:00')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('THANH_TOAN_KHI_NHAN_HANG')
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState(null)
  const [checkoutResult, setCheckoutResult] = useState(null)

  const cartQuery = useQuery({
    queryKey: ['customer', 'cart', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/cart/${userId}`)
      return safeArray(response).map(normalizeCartItem)
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

  const cart = cartQuery.data || []
  const addresses = addressesQuery.data || []

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
  const discountAmount = appliedVoucher ? Math.min(appliedVoucher.discount || 0, totalAmount) : 0
  const finalAmount = Math.max(0, totalAmount - discountAmount)

  const removeMutation = useMutation({
    mutationFn: async (itemId) => apiClient.delete(`/cart/${itemId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
  })

  const decreaseMutation = useMutation({
    mutationFn: async (item) => {
      if (item.so_luong <= 1) {
        return apiClient.delete(`/cart/${item.id}`)
      }
      await apiClient.delete(`/cart/${item.id}`)
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
    },
  })

  const checkoutMutation = useMutation({
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

  // Success state
  if (checkoutResult && !checkoutMutation.isPending) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.successHeader}>
          <Text style={styles.successHeaderTitle}>Đặt hàng thành công!</Text>
        </LinearGradient>
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
            {checkoutResult?.redirect_url ? (
              <Pressable
                onPress={() => Linking.openURL(checkoutResult.redirect_url).catch(() => {})}
                style={styles.vnpayBtn}
              >
                <Ionicons name="card-outline" size={18} color="#fff" />
                <Text style={styles.vnpayBtnText}>Thanh toán qua VNPAY</Text>
              </Pressable>
            ) : null}
            {checkoutResult?.payment_details?.qr_img_url ? (
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

          <Pressable
            onPress={() => {
              setCheckoutResult(null)
              navigation.navigate('Orders')
            }}
            style={styles.viewOrdersBtn}
          >
            <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.viewOrdersBtnGradient}>
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={styles.viewOrdersBtnText}>Xem đơn hàng</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => { setCheckoutResult(null) }} style={styles.continueShoppingBtn}>
            <Text style={styles.continueShoppingText}>Tiếp tục mua sắm</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Giỏ hàng</Text>
            <Text style={styles.headerSubtitle}>{totalItems} sản phẩm · {formatCurrency(totalAmount)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Menu')} style={styles.addMoreBtn}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addMoreText}>Thêm món</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPadding}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading */}
        {cartQuery.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Đang tải giỏ hàng...</Text>
          </View>
        ) : null}

        {/* Empty Cart */}
        {!cartQuery.isLoading && !cart.length ? (
          <View style={styles.emptyCard}>
            <Ionicons name="bag-outline" size={64} color={colors.border} />
            <Text style={styles.emptyTitle}>Giỏ hàng đang trống</Text>
            <Text style={styles.emptyText}>Thêm sản phẩm từ menu để bắt đầu đặt hàng.</Text>
            <Pressable
              onPress={() => navigation.navigate('Menu')}
              style={styles.goMenuBtn}
            >
              <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.goMenuBtnGradient}>
                <Ionicons name="restaurant-outline" size={18} color="#fff" />
                <Text style={styles.goMenuBtnText}>Khám phá Menu</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Cart Items */}
        {cart.map((item) => (
          <CartItem
            key={item.id}
            item={item}
            onIncrease={(i) => addMoreMutation.mutate(i)}
            onDecrease={(i) => decreaseMutation.mutate(i)}
            onRemove={(itemId) => {
              Alert.alert('Xóa sản phẩm', 'Bạn muốn xóa sản phẩm này khỏi giỏ hàng?', [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Xóa', style: 'destructive', onPress: () => removeMutation.mutate(itemId) },
              ])
            }}
          />
        ))}

        {cart.length > 0 ? (
          <>
            {/* Order Summary */}
            <SectionCard title="Tổng quan đơn hàng" icon="receipt-outline">
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tạm tính ({totalItems} món)</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totalAmount)}</Text>
              </View>
              {discountAmount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.success }]}>Giảm giá voucher</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>-{formatCurrency(discountAmount)}</Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Phí giao hàng</Text>
                <Text style={styles.summaryValue}>Tính theo hệ thống</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotal}>Tổng thanh toán</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(finalAmount)}</Text>
              </View>
            </SectionCard>

            {/* Delivery Address */}
            <SectionCard title="Địa chỉ giao hàng" icon="location-outline">
              {addresses.length > 0 ? (
                <View style={styles.addressList}>
                  {addresses.map((address) => {
                    const isActive = address.id === selectedAddressId
                    return (
                      <Pressable
                        key={address.id}
                        onPress={() => setSelectedAddressId(address.id)}
                        style={[styles.addressOption, isActive && styles.addressOptionActive]}
                      >
                        <View style={styles.addressOptionLeft}>
                          <View style={[styles.radioBtn, isActive && styles.radioBtnActive]}>
                            {isActive ? <View style={styles.radioDot} /> : null}
                          </View>
                          <View style={styles.addressOptionInfo}>
                            <View style={styles.addressNameRow}>
                              <Text style={styles.addressName}>{address.ten_dia_chi || 'Địa chỉ'}</Text>
                              {address.mac_dinh ? (
                                <View style={styles.defaultBadge}>
                                  <Text style={styles.defaultBadgeText}>Mặc định</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.addressText} numberOfLines={2}>{address.dia_chi_day_du}</Text>
                            {address.ghi_chu ? <Text style={styles.addressNote}>{address.ghi_chu}</Text> : null}
                          </View>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              ) : (
                <View style={styles.manualAddressWrap}>
                  <Text style={styles.noAddressText}>Bạn chưa có địa chỉ lưu. Nhập địa chỉ thủ công:</Text>
                  <TextInput
                    value={manualAddress}
                    onChangeText={setManualAddress}
                    placeholder="Nhập địa chỉ giao hàng đầy đủ"
                    placeholderTextColor={colors.placeholder}
                    multiline
                    numberOfLines={3}
                    style={styles.manualAddressInput}
                  />
                </View>
              )}
            </SectionCard>

            {/* Delivery Time */}
            <SectionCard title="Khung giờ giao hàng" icon="time-outline">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.slotList}>
                  {DELIVERY_SLOTS.map((slot) => (
                    <Pressable
                      key={slot}
                      onPress={() => setDeliverySlot(slot)}
                      style={[styles.slotChip, deliverySlot === slot && styles.slotChipActive]}
                    >
                      <Text style={[styles.slotText, deliverySlot === slot && styles.slotTextActive]}>
                        {slot}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.noteWrap}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ghi chú cho đơn hàng (tùy chọn)"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  numberOfLines={2}
                  style={styles.noteInput}
                />
              </View>
            </SectionCard>

            {/* Payment Method */}
            <SectionCard title="Phương thức thanh toán" icon="wallet-outline">
              <View style={styles.paymentGrid}>
                {paymentMethodOptions.map((option) => {
                  const isActive = option.value === paymentMethod
                  const pIcon = PAYMENT_ICONS[option.value] || { icon: 'card-outline', color: colors.primary }
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setPaymentMethod(option.value)}
                      style={[styles.paymentCard, isActive && styles.paymentCardActive]}
                    >
                      <View style={[styles.paymentIconWrap, { backgroundColor: `${pIcon.color}15` }]}>
                        <Ionicons name={pIcon.icon} size={24} color={isActive ? pIcon.color : colors.muted} />
                      </View>
                      <Text style={[styles.paymentLabel, isActive && { color: colors.primary }]}>{option.label}</Text>
                      <Text style={styles.paymentDesc} numberOfLines={2}>{option.description}</Text>
                      {isActive ? (
                        <View style={styles.paymentCheck}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                        </View>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            </SectionCard>

            {/* Voucher (quick input) */}
            <SectionCard title="Mã giảm giá" icon="ticket-outline">
              <View style={styles.voucherInputRow}>
                <TextInput
                  value={voucherCode}
                  onChangeText={setVoucherCode}
                  placeholder="Nhập mã voucher"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="characters"
                  style={[styles.voucherInput]}
                />
                <Pressable
                  onPress={() => {
                    if (!voucherCode.trim()) return
                    Alert.alert('Thông báo', 'Mã voucher sẽ được áp dụng khi đặt hàng nếu hợp lệ.')
                    setAppliedVoucher({ ma_khuyen_mai: voucherCode.trim(), discount: 0 })
                  }}
                  style={styles.voucherApplyBtn}
                >
                  <Text style={styles.voucherApplyText}>Áp dụng</Text>
                </Pressable>
              </View>
              {appliedVoucher ? (
                <View style={styles.appliedVoucher}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.appliedVoucherText}>Đã áp dụng: {appliedVoucher.ma_khuyen_mai}</Text>
                  <Pressable onPress={() => { setAppliedVoucher(null); setVoucherCode('') }}>
                    <Ionicons name="close-circle" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ) : null}
            </SectionCard>
          </>
        ) : null}
      </ScrollView>

      {/* Checkout Footer */}
      {cart.length > 0 ? (
        <View style={styles.checkoutFooter}>
          <View style={styles.checkoutSummary}>
            <Text style={styles.checkoutTotalLabel}>{totalItems} món</Text>
            <Text style={styles.checkoutTotalValue}>{formatCurrency(finalAmount)}</Text>
          </View>
          <Pressable
            onPress={handleCheckout}
            disabled={checkoutMutation.isPending}
            style={({ pressed }) => [styles.checkoutBtn, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={checkoutMutation.isPending ? ['#ccc', '#bbb'] : ['#f26b1d', '#d4560e']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.checkoutBtnGradient}
            >
              {checkoutMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              )}
              <Text style={styles.checkoutBtnText}>
                {checkoutMutation.isPending ? 'Đang xử lý...' : 'Đặt hàng ngay'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
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
})
