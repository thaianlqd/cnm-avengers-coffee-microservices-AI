import HolidayMenuBanner from '../components/home/HolidayMenuBanner'
import TextInput from '../components/TextInput'
import Pagination, { usePagination } from '../components/Pagination'
import Reveal, { useListReveal } from '../components/Reveal'
import FulfillmentStrip from '../components/FulfillmentStrip'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { catalogVariantRows, normalizedValue, variantMap, variantPrice } from '../lib/productOptions.mjs'
import Alert from '../lib/alert'
import { useCart } from '../hooks/useCart'
import { useFeedback, errorMessage } from '../context/FeedbackContext'
import Modal from '../components/AppModal'
import Image from '../components/CachedImage'
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,

  Pressable,
  ActivityIndicator,

  ScrollView,
  Platform,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { colors, spacing, shadows, radius } from '../theme'
import {
  formatCurrency,
  getUserId,
  normalizeCartItem,
  normalizeCategory,
  normalizeProduct,
  safeArray,
} from '../lib/customerData'

const SORT_OPTIONS = [
  { value: 'DEFAULT', label: 'Mặc định' },
  { value: 'PRICE_ASC', label: 'Giá tăng dần' },
  { value: 'PRICE_DESC', label: 'Giá giảm dần' },
  { value: 'NAME_ASC', label: 'Tên A-Z' },
]

const PRICE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả giá' },
  { value: 'DUOI_30000', label: 'Dưới 30k' },
  { value: 'TU_30000_DEN_50000', label: '30k - 50k' },
  { value: 'TREN_50000', label: 'Trên 50k' },
]

// Best-effort icon per category name, since we don't hotlink any third-party icon assets
function iconForCategory(label) {
  const s = String(label || '').toLowerCase()
  if (s.includes('mới')) return 'sparkles-outline'
  if (s.includes('ưu đãi') || s.includes('sale') || s.includes('khuyến mãi')) return 'pricetag-outline'
  if (s.includes('phin')) return 'cafe'
  if (s.includes('espresso') || s.includes('americano')) return 'cafe-outline'
  if (s.includes('latte') || s.includes('cappu')) return 'cafe-outline'
  if (s.includes('matcha')) return 'leaf-outline'
  if (s.includes('frappe') || s.includes('đá xay') || s.includes('cold brew')) return 'snow-outline'
  if (s.includes('trà sữa')) return 'water-outline'
  if (s.includes('trà')) return 'leaf-outline'
  if (s.includes('bánh')) return 'restaurant-outline'
  if (s.includes('pizza') || s.includes('pasta')) return 'pizza-outline'
  if (s.includes('topping')) return 'add-circle-outline'
  if (s.includes('merch')) return 'shirt-outline'
  return 'cafe-outline'
}

function ToppingModal({ visible, onClose, availableToppings = {}, selectedToppings = [], onApply }) {
  const [tempSelected, setTempSelected] = useState([])

  useEffect(() => {
    if (visible) {
      setTempSelected([...selectedToppings])
    }
  }, [visible, selectedToppings])

  const toppingKeys = Object.keys(availableToppings)

  const handleToggle = (tp) => {
    if (tempSelected.includes(tp)) {
      setTempSelected(tempSelected.filter(t => t !== tp))
    } else {
      if (tempSelected.length < 3) {
        setTempSelected([...tempSelected, tp])
      } else {
        Alert.alert('Thông báo', 'Bạn chỉ được chọn tối đa 3 loại topping.')
      }
    }
  }

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.toppingOverlay}>
        <View style={modalStyles.contentBox}>
          {/* Header */}
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} style={modalStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#1e293b" />
            </Pressable>
            <Text style={modalStyles.headerTitle}>Topping mua kèm món</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Subtitle Bar */}
          <View style={modalStyles.toppingModalSubBar}>
            <Text style={modalStyles.toppingModalSubText}>Chọn tối đa 3 loại Topping</Text>
          </View>

          {/* Vertical Checkbox List */}
          <ScrollView style={modalStyles.scrollArea} contentContainerStyle={{ paddingBottom: 20 }}>
            {toppingKeys.map((tp) => {
              const tpPrice = Number(availableToppings[tp] || 0)
              const isChecked = tempSelected.includes(tp)
              return (
                <Pressable
                  key={tp}
                  onPress={() => handleToggle(tp)}
                  style={({ pressed }) => [modalStyles.toppingRow, pressed && { backgroundColor: '#f8fafc' }]}
                >
                  <View style={modalStyles.toppingRowLeft}>
                    <View style={[modalStyles.checkbox, isChecked && modalStyles.checkboxActive]}>
                      {isChecked && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                    </View>
                    <Text style={[modalStyles.toppingRowName, isChecked && { color: '#0f172a' }]}>{tp}</Text>
                  </View>
                  <Text style={modalStyles.toppingRowPrice}>+{formatCurrency(tpPrice)}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Footer button */}
          <View style={modalStyles.footer}>
            <Pressable
              onPress={() => onApply(tempSelected)}
              style={({ pressed }) => [modalStyles.applyBtnFull, pressed && { opacity: 0.92 }]}
            >
              <Text style={modalStyles.applyBtnFullText}>
                Áp dụng ({tempSelected.length}/3)
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function ProductDetailModal({ product, cartItem, visible, onClose, onAddToCart, onUpdateCart, userId, allProducts = [], varMap = {}, optionsReady = true, onRetryOptions }) {
  const [selectedSize, setSelectedSize] = useState('Nhỏ')
  const [selectedLuongDa, setSelectedLuongDa] = useState('Bình thường')
  const [selectedDoNgot, setSelectedDoNgot] = useState('Bình thường')
  const [selectedToppings, setSelectedToppings] = useState([])
  const [selectedMilk, setSelectedMilk] = useState('')
  const [custom, setCustom] = useState({})
  const [showToppings, setShowToppings] = useState(true)
  const [showToppingModal, setShowToppingModal] = useState(false)
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setSaveError('')
    if (cartItem) {
      setSelectedSize(cartItem.size || 'Nhỏ')
      setSelectedLuongDa(cartItem.luong_da || '')
      setSelectedDoNgot(cartItem.do_ngot || '')
      setSelectedToppings(Array.isArray(cartItem.toppings) ? cartItem.toppings : [])
      setSelectedMilk(cartItem.loai_sua || '')
      setCustom(cartItem.custom_attributes || {})
      setNote(cartItem.ghi_chu || cartItem.custom_attributes?.ghi_chu || '')
      setQuantity(cartItem.so_luong || 1)
      setShowToppings(true)
      setShowToppingModal(false)
    } else if (product) {
      const pid = String(product.ma_san_pham || product.id || '')
      const realSizes = varMap[pid]?.sizes || {}
      const defaultSizes = Object.keys(realSizes).length > 0 ? realSizes : product.sizes || {}
      const sizeKeys = Object.keys(defaultSizes).sort((a, b) => Number(defaultSizes[a]) - Number(defaultSizes[b]))
      setSelectedSize(sizeKeys.length > 0 ? sizeKeys[0] : 'Nhỏ')
      const ldKeys = Object.keys(varMap[pid]?.luong_da || product.luong_da || {})
      setSelectedLuongDa(ldKeys.find(key => normalizedValue(key) === 'binh thuong') || ldKeys[0] || '')
      const dnKeys = Object.keys(varMap[pid]?.do_ngot || product.do_ngot || {})
      setSelectedDoNgot(dnKeys.find(key => normalizedValue(key) === 'binh thuong') || dnKeys[0] || '')
      setSelectedToppings([])
      setShowToppings(true)
      setShowToppingModal(false)
      setNote('')
      setSelectedMilk(Object.keys(varMap[pid]?.loai_sua || {})[0] || '')
      setCustom(Object.fromEntries(Object.entries(varMap[pid]?.custom || {}).map(([key, values]) => [key, Object.keys(values)[0] || ''])))
      setQuantity(1)
    }
  }, [product, cartItem, varMap])

  const suggestions = useMemo(() => {
    const list = Array.isArray(allProducts) ? allProducts.filter(p => p && p.trang_thai && p.ma_san_pham !== product?.ma_san_pham) : []
    const pastries = list.filter(p => String(p.danh_muc || p.danhMuc?.ten_danh_muc || '').toLowerCase().includes('bánh') || normalizedValue(p.ten_san_pham).includes('banh'))
    if (pastries.length > 0) return pastries.slice(0, 5)
    return []
  }, [allProducts, product])

  if (!product) return null

  const pid = String(product.ma_san_pham || product.id || '')
  const realSizes = varMap[pid]?.sizes || {}
  const realToppings = varMap[pid]?.toppings || {}

  // Use real CSDL sizes if available, otherwise fall back to product data, otherwise defaults
  const availableSizes = Object.keys(realSizes).length > 0
    ? realSizes
    : (product.sizes && Object.keys(product.sizes).length > 0 ? product.sizes : { 'Nhỏ': Number(product.gia_ban || 0) })
  const sizeKeys = Object.keys(availableSizes).sort((a, b) => Number(availableSizes[a]) - Number(availableSizes[b]))

  const availableLuongDa = product.luong_da && Object.keys(product.luong_da).length > 0 ? product.luong_da : (varMap[pid]?.luong_da && Object.keys(varMap[pid].luong_da).length ? varMap[pid].luong_da : {})
  const ldKeys = Object.keys(availableLuongDa)

  const availableDoNgot = product.do_ngot && Object.keys(product.do_ngot).length > 0 ? product.do_ngot : (varMap[pid]?.do_ngot && Object.keys(varMap[pid].do_ngot).length ? varMap[pid].do_ngot : {})
  const dnKeys = Object.keys(availableDoNgot)

  // Use real CSDL toppings if available
  const availableToppings = Object.keys(realToppings).length ? realToppings : (product.toppings || {})
  const toppingKeys = Object.keys(availableToppings)

  const basePrice = Number(availableSizes[selectedSize] !== undefined ? availableSizes[selectedSize] : product.gia_ban || 0)
  const toppingsPrice = selectedToppings.reduce((sum, t) => sum + Number(availableToppings[t] || 0), 0)
  const milkOptions = varMap[pid]?.loai_sua || product.loai_sua || {}
  const extraGroups = varMap[pid]?.custom || {}
  const unitPrice = varMap[pid]?.rows?.length ? variantPrice(product.gia_ban, varMap[pid].rows, { size: selectedSize, toppings: selectedToppings, luong_da: selectedLuongDa, do_ngot: selectedDoNgot, loai_sua: selectedMilk, custom_attributes: custom }) : basePrice + toppingsPrice + Number(availableLuongDa[selectedLuongDa] || 0) + Number(availableDoNgot[selectedDoNgot] || 0) + Number(milkOptions[selectedMilk] || 0)
  const totalPrice = unitPrice * quantity

  return (
    <>
      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.contentBox}>
            {/* Top Header */}
            <View style={modalStyles.header}>
              <Pressable onPress={onClose} style={modalStyles.closeBtn}>
                <Ionicons name="close" size={22} color="#1e293b" />
              </Pressable>
              <Text style={modalStyles.headerTitle}>{cartItem ? 'Sửa món trong giỏ' : 'Thêm vào giỏ'}</Text>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView style={modalStyles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Top Product Hero Section */}
              <View style={modalStyles.productHeroSection}>
                {product.hinh_anh_url ? (
                  <Image source={{ uri: product.hinh_anh_url }} style={modalStyles.productHeroImg} resizeMode="contain" />
                ) : (
                  <View style={[modalStyles.productHeroImg, modalStyles.productHeroPlaceholder]}>
                    <Ionicons name="cafe-outline" size={48} color="#94a3b8" />
                  </View>
                )}
                <View style={modalStyles.productSummaryInfo}>
                  <Text style={modalStyles.productSummaryName}>{product.ten_san_pham}</Text>
                  <Text style={modalStyles.productSummaryPrice}>{formatCurrency(unitPrice)}</Text>
                </View>
              </View>

              {/* Section 1: Gợi ý dùng kèm */}
              {suggestions.length > 0 && <View style={[modalStyles.sectionContainer, { paddingTop: 12 }]}>
                <Text style={modalStyles.sectionLabel}>Gợi ý dùng kèm</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.sugList}>
                  {suggestions.map((sug, idx) => (
                    <View key={sug.ma_san_pham || idx} style={modalStyles.sugCard}>
                      <View style={modalStyles.sugCardTop}>
                        <Image source={{ uri: sug.hinh_anh_url }} style={modalStyles.sugImg} />
                        <View style={modalStyles.sugInfo}>
                          <Text style={modalStyles.sugName} numberOfLines={2}>{sug.ten_san_pham || sug.name}</Text>
                          <Text style={modalStyles.sugPrice}>{formatCurrency(sug.gia_ban || sug.price)}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={modalStyles.sugAddBtn}
                        onPress={async () => { try { await onAddToCart(sug, 1, Object.keys(varMap[String(sug.ma_san_pham)]?.sizes || {})[0] || 'Nhỏ', { unitPrice: sug.gia_ban }) } catch(error) { setSaveError(errorMessage(error)) } }}
                      >
                        <Text style={modalStyles.sugAddBtnText}>Thêm ›</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>


              </View>}

              {/* Section 2: Chọn 1 Loại Size */}
              <View style={modalStyles.sectionContainer}>
                <Text style={modalStyles.sectionLabel}>Chọn 1 Loại Size</Text>
                <View style={modalStyles.pillGrid}>
                  {sizeKeys.map((sz) => {
                    const szPrice = Number(availableSizes[sz] || 0)
                    const isSel = selectedSize === sz
                    return (
                      <Pressable
                        key={sz}
                        onPress={() => setSelectedSize(sz)}
                        style={[modalStyles.pill, isSel && modalStyles.pillActive]}
                      >
                        <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>
                          {sz}: {formatCurrency(szPrice)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              {/* Section 3: Lượng Đá */}
              {ldKeys.length > 0 && <View style={modalStyles.sectionContainer}>
                <Text style={modalStyles.sectionLabel}>Lượng Đá</Text>
                <View style={modalStyles.pillGrid}>
                  {ldKeys.map((ld) => {
                    const isSel = selectedLuongDa === ld
                    return (
                      <Pressable
                        key={ld}
                        onPress={() => setSelectedLuongDa(ld)}
                        style={[modalStyles.pill, isSel && modalStyles.pillActive]}
                      >
                        <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>{ld}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>}

              {/* Section 4: Độ Ngọt */}
              {dnKeys.length > 0 && <View style={modalStyles.sectionContainer}>
                <Text style={modalStyles.sectionLabel}>Độ Ngọt</Text>
                <View style={modalStyles.pillGrid}>
                  {dnKeys.map((dn) => {
                    const isSel = selectedDoNgot === dn
                    return (
                      <Pressable
                        key={dn}
                        onPress={() => setSelectedDoNgot(dn)}
                        style={[modalStyles.pill, isSel && modalStyles.pillActive]}
                      >
                        <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>{dn}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>}

              {/* Section 5: Chọn Tối Đa 3 Loại Topping */}
              {toppingKeys.length > 0 && <View style={modalStyles.sectionContainer}>
                <Text style={modalStyles.sectionLabel}>Chọn Tối Đa 3 Loại Topping</Text>
                <Pressable
                  onPress={() => setShowToppingModal(true)}
                  style={({ pressed }) => [modalStyles.toppingTeaser, pressed && { opacity: 0.92 }]}
                >
                  <View style={modalStyles.teaserIconWrap}>
                    <Ionicons name="cafe" size={18} color="#fff" />
                  </View>
                  <View style={modalStyles.teaserTextWrap}>
                    <Text style={modalStyles.teaserTitle}>Thêm Lựa Chọn</Text>
                    <Text style={modalStyles.teaserSub}>
                      {selectedToppings.length > 0
                        ? `Đã chọn (${selectedToppings.length}/3): ${selectedToppings.join(', ')}`
                        : 'Tùy chọn thêm sữa, syrup hay topping yêu thích để Nhà pha đúng gu bạn nhất (Một số lựa chọn có phụ phí).'}
                    </Text>
                  </View>
                  <View style={[modalStyles.teaserIconWrap, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ffd8b8' }]}>
                    <Ionicons name="chevron-forward" size={18} color="#b22830" />
                  </View>
                </Pressable>

                {selectedToppings.length > 0 && (
                  <View style={[modalStyles.pillGrid, { marginTop: 12 }]}>
                    {selectedToppings.map((tp) => {
                      const tpPrice = Number(availableToppings[tp] || 0)
                      return (
                        <Pressable
                          key={tp}
                          onPress={() => setShowToppingModal(true)}
                          style={[modalStyles.pill, modalStyles.pillActive]}
                        >
                          <Ionicons name="checkmark" size={14} color="#b22830" style={{ marginRight: 4 }} />
                          <Text style={[modalStyles.pillText, modalStyles.pillTextActive]}>
                            {tp} (+{formatCurrency(tpPrice)})
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              </View>}

              {Object.keys(milkOptions).length > 0 && <View style={modalStyles.sectionContainer}><Text style={modalStyles.sectionLabel}>Loại sữa</Text><View style={modalStyles.pillGrid}>{Object.entries(milkOptions).map(([value, price]) => <Pressable key={value} onPress={() => setSelectedMilk(value)} style={[modalStyles.pill, selectedMilk === value && modalStyles.pillActive]}><Text style={[modalStyles.pillText, selectedMilk === value && modalStyles.pillTextActive]}>{value}{price > 0 ? ` (+${formatCurrency(price)})` : ''}</Text></Pressable>)}</View></View>}
              {Object.entries(extraGroups).map(([attr, values]) => <View key={attr} style={modalStyles.sectionContainer}><Text style={modalStyles.sectionLabel}>{attr}</Text><View style={modalStyles.pillGrid}>{Object.entries(values).map(([value, price]) => <Pressable key={value} onPress={() => setCustom(prev => ({ ...prev, [attr]: value }))} style={[modalStyles.pill, custom[attr] === value && modalStyles.pillActive]}><Text style={[modalStyles.pillText, custom[attr] === value && modalStyles.pillTextActive]}>{value}{price > 0 ? ` (+${formatCurrency(price)})` : ''}</Text></Pressable>)}</View></View>)}
              {/* Section 6: Ghi Chú Cho Quán */}
              <View style={modalStyles.sectionContainer}>
                <Text style={modalStyles.sectionLabel}>Ghi Chú Cho Quán</Text>
                <TextInput
                  style={modalStyles.noteInput}
                  placeholder="Nhập ghi chú (VD: Để riêng đá...)"
                  placeholderTextColor="#94a3b8"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            {/* Bottom Footer - Tách 2 bên ra thành 2 hàng dọc: Bộ chọn số lượng ở trên, Nút thêm giỏ hàng tràn viền bên dưới */}
            <View style={modalStyles.footer}>
              {!optionsReady && <Pressable onPress={onRetryOptions}><Text style={{ color: colors.primary, paddingBottom: 8 }}>Đang tải lựa chọn món. Nếu chưa tải được, chạm để thử lại.</Text></Pressable>}
              {!!saveError && <Text accessibilityRole="alert" style={{ color: colors.primary, paddingBottom: 8 }}>{saveError}</Text>}
              <View style={modalStyles.qtyRow}>
                <View style={modalStyles.qtyBox}>
                  <Pressable onPress={() => setQuantity(Math.max(1, quantity - 1))} style={modalStyles.qtyBtnCircle}>
                    <Ionicons name="remove" size={18} color="#0f172a" />
                  </Pressable>
                  <Text style={modalStyles.qtyTextValue}>{quantity}</Text>
                  <Pressable onPress={() => setQuantity(quantity + 1)} style={modalStyles.qtyBtnCircle}>
                    <Ionicons name="add" size={18} color="#0f172a" />
                  </Pressable>
                </View>
              </View>

              <Pressable
                disabled={saving || !product.trang_thai || !optionsReady}
                onPress={async () => {
                  if (saving) return
                  setSaving(true); setSaveError('')
                  const options = { toppings: selectedToppings, luongDa: selectedLuongDa,
                    doNgot: selectedDoNgot, loaiSua: selectedMilk, custom_attributes: { ...custom, ghi_chu: note.trim() }, note: note.trim(), unitPrice }
                  try {
                    if (cartItem) await onUpdateCart(cartItem, quantity, selectedSize, options)
                    else await onAddToCart(product, quantity, selectedSize, options)
                    onClose()
                  } catch (error) { setSaveError(errorMessage(error)) }
                  finally { setSaving(false) }
                }}
                style={({ pressed }) => [modalStyles.addCartActionBtn, pressed && { opacity: 0.92 }]}
              >
                <Ionicons name={cartItem ? "checkmark-circle-outline" : "add-circle-outline"} size={20} color="#ffffff" />
                <Text style={modalStyles.addCartActionText}>
                  {!optionsReady ? 'CHỜ LỰA CHỌN… ' : saving ? 'ĐANG LƯU… ' : !product.trang_thai ? 'TẠM HẾT MÓN ' : cartItem ? 'CẬP NHẬT - ' : 'THÊM VÀO GIỎ - '}{formatCurrency(totalPrice)}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ToppingModal
        visible={showToppingModal}
        onClose={() => setShowToppingModal(false)}
        availableToppings={availableToppings}
        selectedToppings={selectedToppings}
        onApply={(newSelected) => {
          setSelectedToppings(newSelected)
          setShowToppingModal(false)
        }}
      />
    </>
  )
}

export function MenuScreen({ navigation, route }) {
  const { user, activeUserId } = useUser()
  const userId = getUserId(user, activeUserId)
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const searchRef = useRef(null)
  const [grid, setGrid] = useState(true)
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (route?.params?.searchQuery != null) { setSearch(route.params.searchQuery); setActiveCategoryId(null); navigation.setParams({ searchQuery: null }) }
    if (route?.params?.focusSearch) { const timer = setTimeout(() => searchRef.current?.focus(), 100); navigation.setParams({ focusSearch: false }); return () => clearTimeout(timer) }
  }, [route?.params?.searchQuery, route?.params?.focusSearch])
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [priceFilter, setPriceFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('DEFAULT')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyHot, setOnlyHot] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [editingCartItem, setEditingCartItem] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)



  const productListRef = useRef(null)

  const categoriesQuery = useQuery({
    queryKey: ['customer', 'menu-categories'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/danh-muc')
      return safeArray(response).map(normalizeCategory)
    },
    staleTime: 5 * 60 * 1000,
  })

  const productsQuery = useQuery({
    queryKey: ['customer', 'menu-products-all'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/san-pham')
      return safeArray(response).map(item => ({
        ...normalizeProduct(item),
        danh_muc_id: String(item?.danhMuc?.ma_danh_muc || item?.danh_muc_id || ''),
        danh_muc: String(item?.danhMuc?.ten_danh_muc || item?.danh_muc || ''),
        trang_thai: Boolean(item?.trang_thai),
      }))
    },
    staleTime: 60 * 1000,
  })

  const varMap = useMemo(() => variantMap(catalogVariantRows(productsQuery.data || [])), [productsQuery.data])

  useEffect(() => {
    if (route?.params?.selectedProduct) {
      if (!productsQuery.data) return
      const requested = route.params.selectedProduct
      const product = productsQuery.data.find(p => String(p.ma_san_pham) === String(requested.ma_san_pham || requested.id))
      if (!product) { navigation.setParams({ selectedProduct: null }); return }
      setSelectedProduct(product)
      setEditingCartItem(null)
      setIsDetailOpen(true)
      navigation.setParams({ selectedProduct: null })
    }
    if (route?.params?.editCartItem) {
      if (!productsQuery.data) return
      setEditingCartItem(route.params.editCartItem)
      const pId = route.params.editCartItem.ma_san_pham || route.params.editCartItem.id
      let prod = null
      if (productsQuery.data) {
        prod = productsQuery.data.find(p => String(p.id || p.ma_san_pham) === String(pId))
      }
      setSelectedProduct(prod || route.params.editCartItem)
      setIsDetailOpen(true)
      navigation.setParams({ editCartItem: null })
    }
  }, [route?.params?.selectedProduct, route?.params?.editCartItem, navigation, productsQuery.data])

  const cartApi = useCart()
  const notify = useFeedback()
  const cartCount = cartApi.count

  const allCategories = categoriesQuery.data || []
  const allProducts = productsQuery.data || []

  // Filter Level 1 main categories (6 main categories matching Web Customer)
  const categories = useMemo(() => {
    let mainCats = allCategories.filter(cat => Number(cat.cap_bac) === 1 || !cat.ma_danh_muc_cha)
    if (mainCats.length === 0) mainCats = allCategories

    return mainCats.filter(cat => {
      const childIds = allCategories.filter(c => String(c.ma_danh_muc_cha) === String(cat.id)).map(c => String(c.id))
      const targetIds = [String(cat.id), ...childIds]
      return allProducts.some(p => targetIds.includes(String(p.danh_muc_id)) || String(p.danh_muc).toLowerCase().includes(cat.label.toLowerCase()))
    })
  }, [allCategories, allProducts])

  // Apply search / price / availability / hot / sort filters
  const filteredProducts = useMemo(() => {
    let list = [...allProducts]

    if (search.trim()) {
      const kw = normalizedValue(search)
      list = list.filter(p =>
        normalizedValue(p.ten_san_pham).includes(kw) ||
        normalizedValue(p.mo_ta).includes(kw) ||
        normalizedValue(p.danh_muc).includes(kw)
      )
    }

    if (priceFilter === 'DUOI_30000') list = list.filter(p => p.gia_ban < 30000)
    else if (priceFilter === 'TU_30000_DEN_50000') list = list.filter(p => p.gia_ban >= 30000 && p.gia_ban <= 50000)
    else if (priceFilter === 'TREN_50000') list = list.filter(p => p.gia_ban > 50000)

    if (onlyAvailable) list = list.filter(p => Boolean(p.trang_thai))
    if (onlyHot) list = list.filter(p => Boolean(p.la_hot))

    if (sortBy === 'PRICE_ASC') list.sort((a, b) => a.gia_ban - b.gia_ban)
    else if (sortBy === 'PRICE_DESC') list.sort((a, b) => b.gia_ban - a.gia_ban)
    else if (sortBy === 'NAME_ASC') list.sort((a, b) => a.ten_san_pham.localeCompare(b.ten_san_pham, 'vi'))

    return list
  }, [allProducts, search, priceFilter, sortBy, onlyAvailable, onlyHot])

  // Group into sections per main category
  const sections = useMemo(() => {
    return categories
      .map((cat) => {
        const childIds = allCategories.filter(c => String(c.ma_danh_muc_cha) === String(cat.id)).map(c => String(c.id))
        const targetIds = [String(cat.id), ...childIds]
        const data = filteredProducts.filter(p => targetIds.includes(String(p.danh_muc_id)) || String(p.danh_muc).toLowerCase().includes(cat.label.toLowerCase()))
        return {
          id: String(cat.id),
          title: cat.label,
          data,
        }
      })
      .filter(sec => sec.data.length > 0)
  }, [categories, allCategories, filteredProducts])

  const activeCategory = activeCategoryId
  const displayedProducts = activeCategory ? sections.find(c => c.id === activeCategory)?.data || [] : filteredProducts
  const paging = usePagination(displayedProducts, JSON.stringify([search, activeCategory, priceFilter, sortBy, onlyAvailable, onlyHot]))
  const reveal = useListReveal()
  const changePage = page => { paging.setPage(page); productListRef.current?.scrollToOffset({ offset: 0, animated: false }) }
  const categoryTitle = categories.find(c => String(c.id) === activeCategory)?.label || (search ? 'Kết quả tìm kiếm' : 'Thực đơn')
  const categoryPhotos = categories.map(c => { const ids = [String(c.id), ...allCategories.filter(k => String(k.ma_danh_muc_cha) === String(c.id)).map(k => String(k.id))]; return { ...c, image: allProducts.find(p => ids.includes(String(p.danh_muc_id)))?.hinh_anh_url } })

  const handleAddToCart = async (item, quantity = 1, size = 'Nhỏ', options = {}) => {
    await cartApi.add(item, quantity, { size, toppings: options.toppings || [],
      luong_da: options.luongDa || '', do_ngot: options.doNgot || '', loai_sua: options.loaiSua || '',
      custom_attributes: { ...(options.custom_attributes || {}), ghi_chu: options.note || '' } })
    notify(`Đã thêm ${quantity} ${item.ten_san_pham} vào giỏ hàng`)
  }
  const handleUpdateCart = async (item, quantity, size, options) => {
    await cartApi.update(item.id, { so_luong: quantity, size, toppings: options.toppings || [],
      luong_da: options.luongDa || '', do_ngot: options.doNgot || '', loai_sua: options.loaiSua || '',
      custom_attributes: { ...(options.custom_attributes || {}), ghi_chu: options.note || '' } })
    notify('Đã cập nhật món trong giỏ hàng')
  }

  const activeFiltersCount = [
    priceFilter !== 'ALL',
    onlyAvailable,
    onlyHot,
    sortBy !== 'DEFAULT',
  ].filter(Boolean).length

  const handleSidebarPress = useCallback((categoryId) => {
    setActiveCategoryId(categoryId)
    productListRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [])

  useEffect(() => {
    if (route?.params?.categoryId && categories.length) {
      handleSidebarPress(String(route.params.categoryId))
      navigation.setParams({ categoryId: null })
    }
  }, [route?.params?.categoryId, sections.length, handleSidebarPress, navigation])

  const renderProductRow = ({ item }) => (
    <Pressable
      onPress={() => navigation.navigate('ProductDetail', { productId: item.ma_san_pham })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      {item.hinh_anh_url ? (
        <Image source={{ uri: item.hinh_anh_url }} style={styles.rowImage} resizeMode="cover" />
      ) : (
        <View style={[styles.rowImage, styles.rowImagePlaceholder]}>
          <Ionicons name="cafe-outline" size={22} color={colors.muted} />
        </View>
      )}

      <View style={styles.rowInfo}>
        <View style={styles.rowBadgeLine}>
          {item.la_hot ? <View style={styles.badgeHot}><Text style={styles.badgeText}>HOT</Text></View> : null}
          {item.la_moi ? <View style={styles.badgeNew}><Text style={styles.badgeText}>MỚI</Text></View> : null}
          {item.gia_niem_yet && item.gia_niem_yet > item.gia_ban ? (
            <View style={styles.badgeSale}>
              <Text style={styles.badgeText}>
                -{Math.round((1 - item.gia_ban / item.gia_niem_yet) * 100)}%
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowName} numberOfLines={2}>{item.ten_san_pham}</Text>
        <View style={styles.rowPriceLine}>
          <Text style={styles.rowPrice}>{formatCurrency(item.gia_ban)}</Text>
          {item.gia_niem_yet && item.gia_niem_yet > item.gia_ban ? (
            <Text style={styles.rowOldPrice}>{formatCurrency(item.gia_niem_yet)}</Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onStartShouldSetResponder={() => true}
        onPress={(e) => {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
          if (e && typeof e.preventDefault === 'function') e.preventDefault()
          setSelectedProduct(item)
          setIsDetailOpen(true)
        }}
        style={({ pressed }) => [styles.plusBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="add" size={18} color={colors.primary} />
      </Pressable>
    </Pressable>
  )

  const renderGridProduct = ({ item }) => <Reveal visible={reveal.visible.has(String(item.id))} style={catalogStyles.card}>
    <Pressable onPress={() => navigation.navigate('ProductDetail', { productId: item.ma_san_pham })} accessibilityLabel={`Chi tiết ${item.ten_san_pham}`}>
      <View style={catalogStyles.photo}><Image source={{ uri: item.hinh_anh_url }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="contain" />{item.la_hot || item.la_moi ? <Text style={catalogStyles.flag}>{item.la_moi ? 'MỚI' : 'BÁN CHẠY'}</Text> : null}</View>
      <Text style={catalogStyles.name} numberOfLines={2}>{item.ten_san_pham}</Text>
    </Pressable>
    <View style={catalogStyles.priceLine}><Text style={catalogStyles.price}>{formatCurrency(item.gia_ban)}</Text><Pressable onPress={() => { setSelectedProduct(item); setEditingCartItem(null); setIsDetailOpen(true) }} accessibilityLabel={`Thêm ${item.ten_san_pham}`} style={catalogStyles.add}><Ionicons name="add" color="#fff" size={20} /></Pressable></View>
  </Reveal>
  const isLoading = categoriesQuery.isLoading || productsQuery.isLoading

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, paddingBottom: 8 }]}>
        <View style={styles.headerTop}>
          <Pressable style={styles.modeSelectorClean} onPress={() => navigation.navigate('StoresTab')}>
            <Ionicons name="cafe-outline" size={20} color="#1e293b" />
            <Text style={styles.modeSelectorTextClean}>Chọn cửa hàng & nhận món</Text>
            <Ionicons name="chevron-down" size={16} color="#64748b" />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Cart')} style={styles.headerRightCart}>
            <Ionicons name="bag-outline" size={24} color="#1a1a1a" />
            {cartCount > 0 ? (
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>{cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#8f8f8f" style={styles.searchIcon} />
            <TextInput
              ref={searchRef}
              accessibilityLabel="Tìm món theo tên"
              returnKeyType="search"
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm món"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setShowFilterPanel(true)}
            style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
          >
            <Ionicons name="options-outline" size={18} color={activeFiltersCount > 0 ? '#fff' : colors.text} />
            {activeFiltersCount > 0 ? (
              <View style={styles.filterCountBadge}>
                <Text style={styles.filterCountText}>{activeFiltersCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={catalogStyles.categories}>
          <Pressable onPress={() => handleSidebarPress(null)} style={[catalogStyles.category, !activeCategory && catalogStyles.selected]}><View style={catalogStyles.allIcon}><Ionicons name="grid-outline" size={26} color={colors.primary} /></View><Text style={catalogStyles.categoryText}>Tất cả</Text></Pressable>
          {categoryPhotos.map(c => <Pressable key={c.id} onPress={() => handleSidebarPress(String(c.id))} style={[catalogStyles.category, activeCategory === String(c.id) && catalogStyles.selected]}><Image source={{ uri: c.image }} style={{ width: 52, height: 52 }} resizeMode="contain" /><Text style={catalogStyles.categoryText} numberOfLines={2}>{c.label}</Text></Pressable>)}
        </ScrollView>
        <View style={catalogStyles.heading}><View style={{ flex: 1 }}><Text style={catalogStyles.title}>{categoryTitle}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>{displayedProducts.length} món</Text></View>{[{ value: false, icon: 'list-outline', label: 'Hiển thị danh sách' }, { value: true, icon: 'grid-outline', label: 'Hiển thị hai cột' }].map(v => <Pressable key={v.label} onPress={() => setGrid(v.value)} accessibilityLabel={v.label} style={{ padding: 9 }}><Ionicons name={v.icon} size={20} color={grid === v.value ? colors.primary : '#bbb'} /></Pressable>)}</View>
        {isLoading ? <ActivityIndicator style={{ margin: 32 }} color={colors.primary} /> : categoriesQuery.isError || productsQuery.isError ? <Pressable onPress={() => { categoriesQuery.refetch(); productsQuery.refetch() }} style={{ padding: 24 }}><Text>Chưa tải được thực đơn. Chạm để thử lại.</Text></Pressable> : <FlatList
          ListHeaderComponent={!search && !activeCategory ? <HolidayMenuBanner /> : null}
          ref={productListRef} key={grid ? 'grid' : 'list'} numColumns={grid ? 2 : 1} data={paging.items} keyExtractor={item => String(item.ma_san_pham)}
          renderItem={grid ? renderGridProduct : info => <Reveal visible={reveal.visible.has(String(info.item.id))}>{renderProductRow(info)}</Reveal>} onViewableItemsChanged={reveal.onViewableItemsChanged} viewabilityConfig={reveal.viewabilityConfig} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} columnWrapperStyle={grid ? { gap: 12 } : undefined}
          initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          ListEmptyComponent={<View style={{ padding: 28, alignItems: 'center', gap: 12 }}><Ionicons name="search-outline" size={32} color={colors.muted} /><Text>Không tìm thấy món phù hợp</Text><Pressable onPress={() => { setSearch(''); setActiveCategoryId(null); setPriceFilter('ALL'); setOnlyHot(false); setOnlyAvailable(false) }}><Text style={{ color: colors.primary }}>Xóa bộ lọc</Text></Pressable></View>} />}
      </View>
      <Pagination {...paging} onChange={changePage} />
      <FulfillmentStrip navigation={navigation} />

      {/* Filter Modal */}
      <Modal visible={showFilterPanel} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilterPanel(false)}>
        <View style={filterStyles.container}>
          <View style={filterStyles.header}>
            <Text style={filterStyles.title}>Lọc & Sắp xếp</Text>
            <Pressable onPress={() => setShowFilterPanel(false)} style={filterStyles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={filterStyles.body} showsVerticalScrollIndicator={false}>
            <Text style={filterStyles.sectionLabel}>Khoảng giá</Text>
            <View style={filterStyles.optionRow}>
              {PRICE_FILTER_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => setPriceFilter(opt.value)}
                  style={[filterStyles.optionChip, priceFilter === opt.value && filterStyles.optionChipActive]}
                >
                  <Text style={[filterStyles.optionText, priceFilter === opt.value && filterStyles.optionTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={filterStyles.sectionLabel}>Sắp xếp</Text>
            <View style={filterStyles.optionRow}>
              {SORT_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  onPress={() => setSortBy(opt.value)}
                  style={[filterStyles.optionChip, sortBy === opt.value && filterStyles.optionChipActive]}
                >
                  <Text style={[filterStyles.optionText, sortBy === opt.value && filterStyles.optionTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={filterStyles.sectionLabel}>Điều kiện</Text>
            <View style={filterStyles.toggleRow}>
              <Pressable
                onPress={() => setOnlyAvailable(!onlyAvailable)}
                style={[filterStyles.toggleChip, onlyAvailable && filterStyles.optionChipActive]}
              >
                <Ionicons name={onlyAvailable ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={onlyAvailable ? '#fff' : colors.muted} />
                <Text style={[filterStyles.optionText, onlyAvailable && filterStyles.optionTextActive]}>Đang bán</Text>
              </Pressable>
              <Pressable
                onPress={() => setOnlyHot(!onlyHot)}
                style={[filterStyles.toggleChip, onlyHot && filterStyles.optionChipActive]}
              >
                <Ionicons name={onlyHot ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={onlyHot ? '#fff' : colors.muted} />
                <Text style={[filterStyles.optionText, onlyHot && filterStyles.optionTextActive]}>🔥 Nổi bật</Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={filterStyles.footer}>
            <Pressable
              onPress={() => {
                setPriceFilter('ALL')
                setSortBy('DEFAULT')
                setOnlyAvailable(false)
                setOnlyHot(false)
              }}
              style={filterStyles.resetBtn}
            >
              <Text style={filterStyles.resetBtnText}>Xóa bộ lọc</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowFilterPanel(false)}
              style={filterStyles.applyBtn}
            >
              <LinearGradient colors={['#b22830', '#8d1f27']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={filterStyles.applyBtnGradient}>
                <Text style={filterStyles.applyBtnText}>Áp dụng</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Product Detail Modal */}
      {isDetailOpen && (
        <ProductDetailModal
          product={selectedProduct}
          cartItem={editingCartItem}
          visible={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false)
            setTimeout(() => {
              setSelectedProduct(null)
              setEditingCartItem(null)
            }, 300)
          }}
          onAddToCart={handleAddToCart}
          onUpdateCart={handleUpdateCart}
          userId={userId}
        allProducts={productsQuery.data || []}
        varMap={varMap}
        optionsReady={productsQuery.isSuccess}
        onRetryOptions={() => productsQuery.refetch()}
      />
      )}
    </View>
  )
}

const SIDEBAR_WIDTH = 96

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Header
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    height: 40,
  },
  modeSelectorClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  modeSelectorTextClean: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    letterSpacing: 0.1,
  },
  headerRightCart: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    position: 'relative',
  },
  headerCartBadge: {
    position: 'absolute',
    top: 2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  headerCartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '500',
  },
  cartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
  },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },

  // Loading
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },

  // Body: sidebar + list
  body: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
  },

  // Sidebar
  sidebar: {
    width: 96,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderColor: '#f2f2f2',
    paddingTop: 8,
  },
  sidebarItem: {
    width: 84,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 12,
  },
  sidebarItemActive: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d97706',
    elevation: 1,
    shadowColor: '#b22830',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  sidebarIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sidebarIconWrapActive: {
    backgroundColor: '#fff',
  },
  sidebarLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4a4a4a',
    textAlign: 'center',
    lineHeight: 14,
  },
  sidebarLabelActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },

  // Section header (right column)
  sectionHeaderWrap: {
    backgroundColor: '#fff3db',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },

  // List
  listContent: {
    paddingBottom: 24,
    backgroundColor: '#fff',
    flexGrow: 1,
  },

  // Product row (flat, TCH-style)
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    backgroundColor: '#fff',
  },
  rowImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
  },
  rowImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    marginRight: 8,
  },
  rowBadgeLine: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 3,
  },
  badgeHot: {
    backgroundColor: '#ef4444',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeNew: {
    backgroundColor: '#0ea5e9',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeSale: {
    backgroundColor: '#22c55e',
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
    lineHeight: 20,
  },
  rowPriceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  rowPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  rowOldPrice: {
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  plusBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b22830',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingChatWidget: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    elevation: 8,
    shadowColor: '#c41230',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    zIndex: 999,
  },
  floatingChatGradient: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },

  floatingCart: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fff4ec',
    borderWidth: 1,
    borderColor: '#fce3d1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#b22830',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    zIndex: 9999,
  },
  floatingCartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  floatingCartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  resetBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
})

// Product Detail Modal Styles (TCH High-End Compact Layout)
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  toppingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  contentBox: {
    width: '100%',
    height: '90%',
    maxWidth: '100%',
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  productHeroSection: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 8,
    borderBottomColor: '#f8fafc',
  },
  productHeroImg: {
    width: 170,
    height: 170,
    borderRadius: 16,
    marginBottom: 16,
  },
  productHeroPlaceholder: {
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productSummaryInfo: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  productSummaryName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'left',
    letterSpacing: -0.4,
  },
  productSummaryPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d97724',
    marginTop: 4,
    textAlign: 'left',
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 10,
  },
  sugList: {
    gap: 12,
    paddingRight: 16,
  },
  sugCard: {
    width: 180,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 10,
    justifyContent: 'space-between',
  },
  sugCardTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  sugImg: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  sugInfo: {
    flex: 1,
  },
  sugName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
    lineHeight: 18,
  },
  sugPrice: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 2,
  },
  sugAddBtn: {
    backgroundColor: '#d97724',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  sugAddBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  hopGuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 6,
    gap: 16,
  },
  hopGuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hopGuText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  hopGuActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hopGuThumbBtn: {
    width: 44,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillActive: {
    borderColor: '#d97724',
    backgroundColor: '#fff8f2',
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#334155',
  },
  pillTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  toppingTeaser: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff8f2',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  teaserIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d97724',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teaserTextWrap: {
    flex: 1,
  },
  teaserTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0f172a',
  },
  teaserSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#1e293b',
    minHeight: 75,
    backgroundColor: '#ffffff',
  },
  footer: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    flexDirection: 'column',
    gap: 12,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qtyBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    minWidth: 32,
    textAlign: 'center',
  },
  toppingModalSubBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  toppingModalSubText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  toppingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  toppingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#b22830',
    borderColor: '#b22830',
  },
  toppingRowName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  toppingRowPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d97724',
  },
  applyBtnFull: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#b22830',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#b22830',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  applyBtnFullText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  addCartActionBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#b22830',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#b22830',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  addCartActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
})

// Filter Modal Styles
const filterStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  optionTextActive: {
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  applyBtn: {
    flex: 2,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  applyBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
})

const catalogStyles = StyleSheet.create({
 categories: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 }, category: { width: 75, alignItems: 'center', paddingVertical: 6, borderBottomWidth: 2, borderColor: 'transparent' }, selected: { borderColor: colors.primary }, allIcon: { height: 52, width: 52, alignItems: 'center', justifyContent: 'center' }, categoryText: { fontSize: 10, lineHeight: 14, minHeight: 28, textAlign: 'center', color: colors.text, marginTop: 5 }, heading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderColor: '#eee' }, title: { fontSize: 16, fontWeight: '600', color: colors.text }, card: { flex: 1, maxWidth: '50%', marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 9, borderRadius: 8 }, photo: { backgroundColor: '#faf7f3', borderRadius: 5, overflow: 'hidden' }, flag: { position: 'absolute', bottom: 5, left: 5, fontSize: 9, fontWeight: '600', color: '#fff', backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 3 }, name: { fontWeight: '600', fontSize: 13, lineHeight: 19, minHeight: 38, marginTop: 10 }, priceLine: { flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, price: { fontSize: 13, color: colors.primary, fontWeight: '600', flexShrink: 1 }, add: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
})
