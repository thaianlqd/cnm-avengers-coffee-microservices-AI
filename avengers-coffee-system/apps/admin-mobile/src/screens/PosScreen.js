import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatCurrency } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

const ORDER_TYPES = [
  { value: 'TAI_CHO', label: '🍽 Dùng tại quầy' },
  { value: 'MANG_DI', label: '🛍 Mang đi' },
]

const PAYMENT_METHODS = [
  { value: 'THANH_TOAN_KHI_NHAN_HANG', label: '💵 Tiền mặt' },
  { value: 'NGAN_HANG_QR', label: '📱 QR ngân hàng' },
  { value: 'VNPAY', label: '💳 VNPAY' },
]

export function PosScreen() {
  const { sessionBranchCode, sessionUsername } = useAdmin()
  const [orderType, setOrderType] = useState('TAI_CHO')
  const [paymentMethod, setPaymentMethod] = useState('THANH_TOAN_KHI_NHAN_HANG')
  const [customerName, setCustomerName] = useState('')
  const [tableCode, setTableCode] = useState('')
  const [note, setNote] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [cashInput, setCashInput] = useState('')
  const [lastOrder, setLastOrder] = useState(null)
  const [posStatus, setPosStatus] = useState({ error: null, success: null })
  const [creating, setCreating] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'

  const loadProducts = useCallback(async () => {
    try {
      const [menuRes, invRes] = await Promise.all([
        apiClient.get('/menu/items'),
        apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(branchCode)}`),
      ])
      const menuArr = menuRes?.items || (Array.isArray(menuRes) ? menuRes : [])
      const invArr = Array.isArray(invRes) ? invRes : (invRes?.items || [])
      const invMap = new Map(invArr.map((row) => [Number(row.ma_san_pham), row]))
      const merged = menuArr.map((item) => {
        const productId = Number(item.id)
        const stock = invMap.get(productId)
        const dangBan = stock?.dang_kinh_doanh !== undefined
          ? Boolean(stock.dang_kinh_doanh)
          : item.dang_ban !== undefined ? Boolean(item.dang_ban) : Boolean(item.trang_thai)
        return {
          ma_san_pham: productId,
          ten_san_pham: item.name || item.ten_san_pham || '',
          category: item.category || '',
          gia_ban: Number(item.price || 0),
          dang_ban: dangBan,
          so_luong_ton: Number(stock?.so_luong_ton ?? 0),
        }
      }).filter((item) => item.dang_ban)
      setProducts(merged)
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }, [branchCode])

  React.useEffect(() => { loadProducts() }, [loadProducts])

  React.useEffect(() => {
    let intervalId
    if (lastOrder?.order && lastOrder.order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG') {
      const orderId = lastOrder.order.ma_don_hang
      intervalId = setInterval(async () => {
        try {
          const res = await apiClient.get(`/staff/orders?branch_code=${encodeURIComponent(branchCode)}`)
          const orders = res?.orders || res
          if (Array.isArray(orders)) {
            const current = orders.find(o => o.ma_don_hang === orderId)
            if (current && current.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
              setPaymentStatus('PAID')
              clearInterval(intervalId)
            }
          }
        } catch (e) {
          // ignore
        }
      }, 3000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [lastOrder, branchCode])

  const subtotal = useMemo(() => cartItems.reduce((s, i) => s + i.gia_ban * i.qty, 0), [cartItems])
  const vat = useMemo(() => Math.round(subtotal * 0.08), [subtotal])
  const total = Math.round(subtotal)
  const isCash = paymentMethod === 'THANH_TOAN_KHI_NHAN_HANG'
  const cashAmount = Number(cashInput) || 0
  const cashInsufficient = isCash && cashAmount > 0 && cashAmount < total
  const changeAmount = isCash && cashAmount >= total ? cashAmount - total : 0

  const addToCart = (product) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.ma_san_pham === product.ma_san_pham)
      if (existing) return prev.map((i) => i.ma_san_pham === product.ma_san_pham ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
  }

  const decreaseQty = (productId) => {
    setCartItems((prev) => prev.map((i) => i.ma_san_pham === productId ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0))
  }

  const clearPos = () => {
    setCartItems([])
    setCustomerName('')
    setTableCode('')
    setNote('')
    setCashInput('')
    setPosStatus({ error: null, success: null })
  }

  const handleCheckout = async () => {
    if (cartItems.length === 0) return setPosStatus({ success: null, error: 'Giỏ hàng đang trống' })
    if (cashInsufficient) return setPosStatus({ success: null, error: 'Khách đưa thiếu tiền' })

    setCreating(true)
    setPosStatus({ error: null, success: null })
    try {
      const payload = {
        branch_code: branchCode,
        items: cartItems.map((i) => ({
          ma_san_pham: i.ma_san_pham,
          ten_san_pham: i.ten_san_pham,
          so_luong: i.qty,
          gia_ban: i.gia_ban,
        })),
        loai_don_hang: orderType,
        phuong_thuc_thanh_toan: paymentMethod,
        ten_khach_hang: customerName || 'Khách vãng lai',
        ma_ban: tableCode || null,
        ghi_chu: note,
        ten_thu_ngan: sessionUsername,
      }
      const response = await apiClient.post('/staff/orders', payload)
      const data = response?.order || response
      setLastOrder({ order: data, paymentDetails: response?.payment_details || null })
      setPosStatus({ success: `Tạo đơn #${String(data?.ma_don_hang || '').slice(0, 8)} thành công!`, error: null })
      // Don't clear cart immediately, wait for Modal to be closed
    } catch (err) {
      setPosStatus({ success: null, error: err?.response?.data?.message || err?.message || 'Lỗi tạo đơn hàng' })
    } finally {
      setCreating(false)
    }
  }

  const closeSuccessModal = () => {
    setCartItems([])
    setCustomerName('')
    setTableCode('')
    setNote('')
    setCashInput('')
    setLastOrder(null)
    setPaymentStatus(null)
    setPosStatus({ error: null, success: null })
  }

  const cartTotalQty = cartItems.reduce((acc, i) => acc + i.qty, 0)
  const [activeTab, setActiveTab] = useState('MENU')

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>POS Bán Hàng</Text>
        <Text style={styles.pageSubtitle}>Tạo đơn nhanh tại quầy</Text>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'MENU' && styles.tabBtnActive]}
          onPress={() => setActiveTab('MENU')}
        >
          <Text style={[styles.tabText, activeTab === 'MENU' && styles.tabTextActive]}>Chọn món</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'CART' && styles.tabBtnActive]}
          onPress={() => setActiveTab('CART')}
        >
          <Text style={[styles.tabText, activeTab === 'CART' && styles.tabTextActive]}>
            Thanh toán ({cartTotalQty})
          </Text>
        </Pressable>
      </View>

      <View style={styles.contentArea}>
        {activeTab === 'MENU' ? (
          <View style={[styles.menuPanel, shadows.sm]}>
            <Text style={styles.sectionTitle}>Sản phẩm đang bán</Text>
            {loadingProducts ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuGrid}>
                {products.map((p) => (
                  <Pressable
                    key={p.ma_san_pham}
                    style={styles.productCard}
                    onPress={() => {
                      addToCart(p)
                    }}
                  >
                    <Text style={styles.productName} numberOfLines={2}>{p.ten_san_pham}</Text>
                    <Text style={styles.productPrice}>{formatCurrency(p.gia_ban)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {/* Quick access to cart if items added */}
            {cartTotalQty > 0 && (
              <Pressable style={styles.floatingCartBtn} onPress={() => setActiveTab('CART')}>
                <Text style={styles.floatingCartText}>Xem giỏ hàng • {formatCurrency(total)}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <ScrollView style={[styles.cartPanel, shadows.sm]} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.sectionTitle}>Đơn hàng mới</Text>

            {/* Cart items */}
            <View style={{ marginBottom: 16 }}>
              {cartItems.length === 0 ? (
                <Text style={styles.emptyCart}>Chưa có món nào</Text>
              ) : (
                cartItems.map((item) => (
                  <View key={item.ma_san_pham} style={styles.cartItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName}>{item.ten_san_pham}</Text>
                      <Text style={styles.cartItemPrice}>{formatCurrency(item.gia_ban)}</Text>
                    </View>
                    <View style={styles.qtyBox}>
                      <Pressable onPress={() => decreaseQty(item.ma_san_pham)} style={styles.qtyBtn}>
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </Pressable>
                      <Text style={styles.qtyText}>{item.qty}</Text>
                      <Pressable onPress={() => addToCart(item)} style={styles.qtyBtn}>
                        <Ionicons name="add" size={16} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Order Details Form */}
            <View style={styles.formContainer}>
              {/* Options */}
              <View style={styles.row}>
                {ORDER_TYPES.map(type => (
                  <Pressable
                    key={type.value}
                    onPress={() => setOrderType(type.value)}
                    style={[styles.radioBtn, orderType === type.value && styles.radioBtnActive]}
                  >
                    <Text style={[styles.radioText, orderType === type.value && styles.radioTextActive]}>{type.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.inputGroupRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Tên KH (Tùy chọn)</Text>
                  <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Nhập tên KH" />
                </View>
                {orderType === 'TAI_CHO' && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Số bàn</Text>
                    <TextInput style={styles.input} value={tableCode} onChangeText={setTableCode} placeholder="Bàn số" keyboardType="numeric" />
                  </View>
                )}
              </View>

              <View style={styles.paymentSection}>
                <Text style={styles.label}>Phương thức thanh toán</Text>
                <View style={styles.paymentRow}>
                  {PAYMENT_METHODS.map(m => (
                    <Pressable
                      key={m.value}
                      onPress={() => setPaymentMethod(m.value)}
                      style={[styles.paymentBtn, paymentMethod === m.value && styles.paymentBtnActive]}
                    >
                      <Text style={[styles.paymentText, paymentMethod === m.value && styles.paymentTextActive]}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {isCash && (
                <View style={styles.cashSection}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Tiền khách đưa</Text>
                    <TextInput
                      style={[styles.input, cashInsufficient && { borderColor: colors.danger }]}
                      value={cashInput}
                      onChangeText={setCashInput}
                      placeholder="0"
                      keyboardType="numeric"
                    />
                    {cashInsufficient && <Text style={{ color: colors.danger, fontSize: 10, marginTop: 4 }}>Thiếu {formatCurrency(total - cashAmount)}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Tiền thừa</Text>
                    <Text style={styles.changeAmount}>{changeAmount > 0 ? formatCurrency(changeAmount) : '0 đ'}</Text>
                  </View>
                </View>
              )}

              {/* Subtotals */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Thành tiền:</Text>
                <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
              </View>

              {posStatus.error && <Text style={styles.errorText}>{posStatus.error}</Text>}
              {posStatus.success && <Text style={styles.successText}>{posStatus.success}</Text>}

              {/* Actions */}
              <View style={styles.actionRow}>
                <Pressable onPress={clearPos} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>Xóa Trắng</Text>
                </Pressable>
                <Pressable onPress={handleCheckout} disabled={creating || cartItems.length === 0} style={[styles.checkoutBtn, (creating || cartItems.length === 0) && { opacity: 0.6 }]}>
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkoutBtnText}>THANH TOÁN</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Success & QR Modal */}
      <Modal visible={!!lastOrder && !!posStatus.success} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} style={{ marginBottom: 8 }} />
              <Text style={styles.modalTitle}>Tạo Đơn Thành Công!</Text>
              <Text style={styles.modalSub}>
                Mã đơn: #{String(lastOrder?.order?.ma_don_hang || '').slice(0, 8).toUpperCase()}
              </Text>
            </View>

            {/* Show QR if non-cash and QR exists */}
            {lastOrder?.order?.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG' && lastOrder?.paymentDetails?.qr_img_url && (
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                {paymentStatus === 'PAID' ? (
                  <View style={{ alignItems: 'center', padding: 20 }}>
                    <Ionicons name="shield-checkmark" size={60} color={colors.success} />
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.success, marginTop: 12 }}>Đã nhận thanh toán!</Text>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: colors.text }}>
                      {lastOrder?.order?.phuong_thuc_thanh_toan === 'VNPAY' ? 'Mã thanh toán VNPAY' : 'Mã QR Chuyển khoản'}
                    </Text>
                    <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}>
                      <Image 
                        source={{ uri: lastOrder.paymentDetails.qr_img_url }}
                        style={{ width: 280, height: 280 }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 16, textAlign: 'center', paddingHorizontal: 20 }}>
                      Đưa thiết bị cho khách hàng quét mã để thanh toán. Đang chờ xác nhận...
                    </Text>
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
                  </>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 24 }}>
              <Pressable onPress={() => Alert.alert('Thông báo', 'Tính năng in hóa đơn qua máy in Bluetooth đang được phát triển.')} style={[styles.modalBtn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, marginTop: 0 }]}>
                <Text style={[styles.modalBtnText, { color: colors.primary }]}>In Hóa Đơn</Text>
              </Pressable>
              <Pressable onPress={closeSuccessModal} style={[styles.modalBtn, { flex: 1, marginTop: 0 }]}>
                <Text style={styles.modalBtnText}>Đóng & Làm mới</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerTitleContainer: { marginBottom: spacing.md, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  
  tabContainer: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: 'bold', color: colors.muted },
  tabTextActive: { color: colors.primary },
  
  contentArea: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },

  menuPanel: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 60 },
  productCard: { width: '48%', backgroundColor: '#fff', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight },
  productName: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, minHeight: 36 },
  productPrice: { fontSize: 14, fontWeight: 'bold', color: colors.primary },

  floatingCartBtn: { position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 5 },
  floatingCartText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  cartPanel: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: colors.text },
  emptyCart: { textAlign: 'center', color: colors.muted, marginVertical: 20 },
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  cartItemName: { fontSize: 13, fontWeight: '600', color: colors.text },
  cartItemPrice: { fontSize: 12, color: colors.primary, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 4 },
  qtyBtn: { padding: 6 },
  qtyText: { marginHorizontal: 8, fontSize: 14, fontWeight: 'bold' },

  formContainer: { marginTop: 16 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  radioBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  radioBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  radioText: { fontSize: 13, fontWeight: '600', color: colors.text },
  radioTextActive: { color: colors.primary },

  inputGroupRow: { flexDirection: 'row', marginBottom: 12 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.sm, padding: 10, fontSize: 13, color: colors.text },

  paymentSection: { marginBottom: 12 },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: '#fff' },
  paymentBtnActive: { backgroundColor: '#e6f7ea', borderColor: colors.success },
  paymentText: { fontSize: 12, fontWeight: '600', color: colors.text },
  paymentTextActive: { color: colors.success },

  cashSection: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  changeAmount: { fontSize: 16, fontWeight: 'bold', color: colors.primary, paddingVertical: 10 },
  
  qrSection: { alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: 12 },
  qrLabel: { fontSize: 14, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  qrBox: { padding: 8, backgroundColor: '#fff', borderRadius: radius.sm, borderWidth: 1, borderColor: '#f1f5f9' },
  qrHint: { fontSize: 12, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    marginBottom: spacing.sm,
  },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderLight },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '900', color: colors.primary },

  actionRow: { flexDirection: 'row', gap: 12 },
  clearBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#fff' },
  clearBtnText: { fontSize: 14, fontWeight: 'bold', color: colors.text },
  checkoutBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkoutBtnText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  
  errorText: { color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  successText: { color: colors.success, fontSize: 13, marginBottom: 10, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  modalHeader: { alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  modalSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  modalBtn: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 30, backgroundColor: colors.primary, borderRadius: radius.md, width: '100%', alignItems: 'center' },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
})
