import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
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

function ProductDetailModal({ product, visible, onClose, onAddToCart, userId, allProducts = [] }) {
  const [selectedSize, setSelectedSize] = useState('Nhỏ')
  const [selectedLuongDa, setSelectedLuongDa] = useState('Bình thường')
  const [selectedDoNgot, setSelectedDoNgot] = useState('Bình thường')
  const [selectedToppings, setSelectedToppings] = useState([])
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    if (product) {
      const sizeKeys = Object.keys(product.sizes || {})
      setSelectedSize(sizeKeys.length > 0 ? sizeKeys[0] : 'Nhỏ')
      const ldKeys = Object.keys(product.luong_da || {})
      setSelectedLuongDa(ldKeys.length > 0 ? ldKeys[0] : 'Bình thường')
      const dnKeys = Object.keys(product.do_ngot || {})
      setSelectedDoNgot(dnKeys.length > 0 ? dnKeys[0] : 'Bình thường')
      setSelectedToppings(product.toppings ? [] : [])
      setNote('')
      setQuantity(1)
    }
  }, [product])

  const suggestions = useMemo(() => {
    const list = Array.isArray(allProducts) ? allProducts.filter(p => p && p.ma_san_pham !== product?.ma_san_pham) : []
    const pastries = list.filter(p => String(p.danh_muc || p.danhMuc?.ten_danh_muc || '').toLowerCase().includes('bánh') || String(p.ten_san_pham || '').toLowerCase().includes('bánh'))
    if (pastries.length > 0) return pastries.slice(0, 5)
    return [
      { ma_san_pham: 901, ten_san_pham: 'Butter Croissant', gia_ban: 29000, hinh_anh_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200' },
      { ma_san_pham: 902, ten_san_pham: 'Wafu Pasta Heo Nướng Xốt Shoyu', gia_ban: 69000, hinh_anh_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200' },
      { ma_san_pham: 903, ten_san_pham: 'Bánh Mì Que Gà Phô Mai', gia_ban: 19000, hinh_anh_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200' },
    ]
  }, [allProducts, product])

  if (!product) return null

  const availableSizes = product.sizes && Object.keys(product.sizes).length > 0 ? product.sizes : { 'Nhỏ': product.gia_ban || 35000, 'Vừa': (product.gia_ban || 35000) + 6000, 'Lớn': (product.gia_ban || 35000) + 10000 }
  const sizeKeys = Object.keys(availableSizes)

  const availableLuongDa = product.luong_da && Object.keys(product.luong_da).length > 0 ? product.luong_da : { 'Bình thường': 0, 'Đá riêng': 0, 'Ít đá': 0 }
  const ldKeys = Object.keys(availableLuongDa)

  const availableDoNgot = product.do_ngot && Object.keys(product.do_ngot).length > 0 ? product.do_ngot : { 'Bình thường': 0, 'Ít ngọt': 0, 'Thêm ngọt': 0 }
  const dnKeys = Object.keys(availableDoNgot)

  const availableToppings = product.toppings && Object.keys(product.toppings).length > 0 ? product.toppings : {
    'Trân châu trắng': 10000,
    'Thạch cà phê': 10000,
    'Kem Phô Mai Macchiato': 15000,
    'Shot Espresso': 10000,
  }
  const toppingKeys = Object.keys(availableToppings)

  const basePrice = Number(availableSizes[selectedSize] !== undefined ? availableSizes[selectedSize] : product.gia_ban || 0)
  const toppingsPrice = selectedToppings.reduce((sum, t) => sum + Number(availableToppings[t] || 0), 0)
  const unitPrice = basePrice + toppingsPrice
  const totalPrice = unitPrice * quantity

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.contentBox}>
          {/* Top Header */}
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} style={modalStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#1e293b" />
            </Pressable>
            <Text style={modalStyles.headerTitle}>Thêm vào giỏ</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView style={modalStyles.scrollArea} contentContainerStyle={modalStyles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Top Product Hero Section */}
            <View style={modalStyles.productHeroSection}>
              {product.hinh_anh_url ? (
                <Image source={{ uri: product.hinh_anh_url }} style={modalStyles.productHeroImg} resizeMode="contain" />
              ) : (
                <View style={[modalStyles.productHeroImg, modalStyles.productHeroPlaceholder]}>
                  <Ionicons name="cafe-outline" size={48} color="#94a3b8" />
                </View>
              )}
              <Text style={modalStyles.productSummaryName}>{product.ten_san_pham}</Text>
              <Text style={modalStyles.productSummaryPrice}>{formatCurrency(unitPrice)}</Text>
            </View>

            {/* Section 1: Gợi ý dùng kèm */}
            <View style={modalStyles.sectionContainer}>
              <Text style={modalStyles.sectionLabel}>Gợi ý dùng kèm</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.sugList}>
                {suggestions.map((sug, idx) => (
                  <View key={sug.ma_san_pham || idx} style={modalStyles.sugCard}>
                    <View style={modalStyles.sugCardTop}>
                      <Image source={{ uri: sug.hinh_anh_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200' }} style={modalStyles.sugImg} />
                      <View style={modalStyles.sugInfo}>
                        <Text style={modalStyles.sugName} numberOfLines={2}>{sug.ten_san_pham}</Text>
                        <Text style={modalStyles.sugPrice}>{formatCurrency(sug.gia_ban || 29000)}</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => {
                        onAddToCart(sug, 1, 'Nhỏ')
                      }}
                      style={modalStyles.sugAddBtn}
                    >
                      <Text style={modalStyles.sugAddBtnText}>{formatCurrency(sug.gia_ban || 29000)}  Thêm ›</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>

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
            <View style={modalStyles.sectionContainer}>
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
                      <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>
                        {ld}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Section 4: Độ Ngọt */}
            <View style={modalStyles.sectionContainer}>
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
                      <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>
                        {dn}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Section 5: Chọn Tối Đa 3 Loại Topping */}
            <View style={modalStyles.sectionContainer}>
              <Text style={modalStyles.sectionLabel}>Chọn Tối Đa 3 Loại Topping</Text>
              <View style={modalStyles.toppingTeaser}>
                <View style={modalStyles.teaserIconWrap}>
                  <Ionicons name="cafe" size={18} color="#fff" />
                </View>
                <View style={modalStyles.teaserTextWrap}>
                  <Text style={modalStyles.teaserTitle}>Thêm Lựa Chọn</Text>
                  <Text style={modalStyles.teaserSub}>Tùy chọn thêm sữa, syrup hay topping yêu thích để Nhà pha đúng gu bạn nhất (Một số lựa chọn có phụ phí).</Text>
                </View>
              </View>
              <View style={[modalStyles.pillGrid, { marginTop: 12 }]}>
                {toppingKeys.map((tp) => {
                  const isSel = selectedToppings.includes(tp)
                  const tpPrice = Number(availableToppings[tp] || 0)
                  return (
                    <Pressable
                      key={tp}
                      onPress={() => {
                        if (isSel) {
                          setSelectedToppings(selectedToppings.filter(t => t !== tp))
                        } else if (selectedToppings.length < 3) {
                          setSelectedToppings([...selectedToppings, tp])
                        } else {
                          Alert.alert('Thông báo', 'Bạn chỉ được chọn tối đa 3 loại topping.')
                        }
                      }}
                      style={[modalStyles.pill, isSel && modalStyles.pillActive]}
                    >
                      {isSel && <Ionicons name="checkmark" size={14} color="#ea8025" style={{ marginRight: 4 }} />}
                      <Text style={[modalStyles.pillText, isSel && modalStyles.pillTextActive]}>
                        {tp} (+{formatCurrency(tpPrice)})
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

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

          {/* Bottom Footer */}
          <View style={modalStyles.footer}>
            <View style={modalStyles.qtyBox}>
              <Pressable onPress={() => setQuantity(Math.max(1, quantity - 1))} style={modalStyles.qtyBtnCircle}>
                <Ionicons name="remove" size={16} color="#334155" />
              </Pressable>
              <Text style={modalStyles.qtyTextValue}>{quantity}</Text>
              <Pressable onPress={() => setQuantity(quantity + 1)} style={modalStyles.qtyBtnCircle}>
                <Ionicons name="add" size={16} color="#334155" />
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                onAddToCart(product, quantity, selectedSize, {
                  toppings: selectedToppings,
                  luongDa: selectedLuongDa,
                  doNgot: selectedDoNgot,
                  note: note.trim(),
                  unitPrice,
                })
                onClose()
              }}
              style={({ pressed }) => [modalStyles.addCartActionBtn, pressed && { backgroundColor: '#d97724' }]}
            >
              <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
              <Text style={modalStyles.addCartActionText}>
                THÊM VÀO GIỎ - {formatCurrency(totalPrice)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function MenuScreen({ navigation, route }) {
  const { user, activeUserId } = useUser()
  const userId = getUserId(user, activeUserId)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [priceFilter, setPriceFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('DEFAULT')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyHot, setOnlyHot] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  useEffect(() => {
    if (route?.params?.selectedProduct) {
      setSelectedProduct(route.params.selectedProduct)
      setIsDetailOpen(true)
      navigation.setParams({ selectedProduct: null })
    }
  }, [route?.params?.selectedProduct, navigation])

  const sectionListRef = useRef(null)
  const sidebarListRef = useRef(null)

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

  const cartCountQuery = useQuery({
    queryKey: ['customer', 'cart', userId, 'count'],
    queryFn: async () => {
      const response = await apiClient.get(`/cart/${userId}`)
      return safeArray(response).map(normalizeCartItem).reduce((sum, item) => sum + Number(item.so_luong || 0), 0)
    },
    enabled: Boolean(userId),
    staleTime: 10 * 1000,
  })
  const cartCount = cartCountQuery.data || 0

  const categories = categoriesQuery.data || []

  // Apply search / price / availability / hot / sort filters (category itself is NOT
  // a filter here — like The Coffee House app, the left rail just jumps to a section)
  const filteredProducts = useMemo(() => {
    let list = [...(productsQuery.data || [])]

    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      list = list.filter(p =>
        String(p.ten_san_pham || '').toLowerCase().includes(kw) ||
        String(p.mo_ta || '').toLowerCase().includes(kw) ||
        String(p.danh_muc || '').toLowerCase().includes(kw)
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
  }, [productsQuery.data, search, priceFilter, sortBy, onlyAvailable, onlyHot])

  // Group into sections per category, in the same order as the sidebar
  const sections = useMemo(() => {
    return categories
      .map((cat) => ({
        id: String(cat.id),
        title: cat.label,
        data: filteredProducts.filter(p => String(p.danh_muc_id) === String(cat.id)),
      }))
      .filter(sec => sec.data.length > 0)
  }, [categories, filteredProducts])

  const activeCategory = activeCategoryId ?? (sections[0]?.id ?? null)

  const addToCartMutation = useMutation({
    mutationFn: async ({ item, quantity, size, options = {}, targetUserId }) => {
      const uid = targetUserId || userId || 'guest-customer'
      const productId = Number(item.ma_san_pham || item.id || 0)
      return apiClient.post('/cart', {
        ma_nguoi_dung: uid,
        ma_san_pham: productId,
        ten_san_pham: item.ten_san_pham || 'Sản phẩm',
        gia_ban: Number(options.unitPrice || item.gia_ban || 0),
        hinh_anh_url: item.hinh_anh_url || '',
        size: size || 'Nhỏ',
        so_luong: Number(quantity || 1),
        toppings: options.toppings || [],
        luong_da: options.luongDa || 'Bình thường',
        do_ngot: options.doNgot || 'Bình thường',
        ghi_chu: options.note || '',
      })
    },
    onMutate: async ({ item, quantity, size, options = {}, targetUserId }) => {
      const uid = targetUserId || userId || 'guest-customer'
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', uid] })
      await queryClient.cancelQueries({ queryKey: ['customer', 'cart', uid, 'count'] })

      const addQty = Number(quantity || 1)
      const itemSize = size || 'Nhỏ'
      const productId = Number(item.ma_san_pham || item.id || 0)
      const unitPrice = Number(options.unitPrice || item.gia_ban || 0)
      const toppingsStr = Array.isArray(options.toppings) && options.toppings.length > 0 ? options.toppings.join(', ') : ''
      const customKey = `${itemSize}_${toppingsStr}_${options.luongDa || ''}_${options.doNgot || ''}_${options.note || ''}`

      queryClient.setQueryData(['customer', 'cart', uid, 'count'], old => (Number(old) || 0) + addQty)
      queryClient.setQueryData(['customer', 'cart', uid], old => {
        const list = Array.isArray(old) ? [...old] : []
        const idx = list.findIndex(i => {
          if (Number(i.ma_san_pham) !== productId || (i.size || 'Nhỏ') !== itemSize) return false
          const iTopStr = Array.isArray(i.toppings) && i.toppings.length > 0 ? i.toppings.join(', ') : ''
          const iKey = `${i.size || 'Nhỏ'}_${iTopStr}_${i.luong_da || ''}_${i.do_ngot || ''}_${i.ghi_chu || ''}`
          return iKey === customKey
        })
        if (idx >= 0) {
          list[idx] = { ...list[idx], so_luong: Number(list[idx].so_luong || 1) + addQty, gia_ban: unitPrice }
        } else {
          list.push({
            id: `local_${Date.now()}_${Math.random()}`,
            ma_nguoi_dung: uid,
            ma_san_pham: productId,
            ten_san_pham: item.ten_san_pham || 'Sản phẩm',
            gia_ban: unitPrice,
            hinh_anh_url: item.hinh_anh_url || '',
            size: itemSize,
            so_luong: addQty,
            toppings: options.toppings || [],
            luong_da: options.luongDa || 'Bình thường',
            do_ngot: options.doNgot || 'Bình thường',
            ghi_chu: options.note || '',
          })
        }
        return list
      })
      return { uid }
    },
    onSuccess: async (data, variables, context) => {
      const uid = context?.uid || userId
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', uid] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', uid, 'count'] })
    },
    onError: (error, variables, context) => {
      // Keep optimistic local update for seamless guest & offline cart experience
    },
  })

  const handleAddToCart = (item, quantity = 1, size = 'Nhỏ', options = {}) => {
    if (!item) return
    const targetUserId = userId || activeUserId || 'guest-customer'
    addToCartMutation.mutate({ item, quantity, size, options, targetUserId })
    const toppingInfo = Array.isArray(options?.toppings) && options.toppings.length > 0 ? ` + ${options.toppings.join(', ')}` : ''
    Alert.alert('✓ Đã thêm vào giỏ', `${item.ten_san_pham} (${quantity}x Size ${size || 'Nhỏ'}${toppingInfo}) đã được thêm vào giỏ.`)
  }

  const activeFiltersCount = [
    priceFilter !== 'ALL',
    onlyAvailable,
    onlyHot,
    sortBy !== 'DEFAULT',
  ].filter(Boolean).length

  const handleSidebarPress = useCallback((categoryId) => {
    setActiveCategoryId(categoryId)
    const sectionIndex = sections.findIndex(sec => sec.id === categoryId)
    if (sectionIndex >= 0 && sectionListRef.current) {
      sectionListRef.current.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      })
    }
  }, [sections])

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const topSection = viewableItems[0].section
      if (topSection) {
        setActiveCategoryId(topSection.id)
        const idx = sections.findIndex(s => s.id === topSection.id)
        if (idx >= 0 && sidebarListRef.current) {
          sidebarListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 })
        }
      }
    }
  }).current

  const renderProductRow = ({ item }) => (
    <Pressable
      onPress={() => {
        setSelectedProduct(item)
        setIsDetailOpen(true)
      }}
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

  const isLoading = categoriesQuery.isLoading || productsQuery.isLoading

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.modeSelectorClean} onPress={() => {}}>
            <Ionicons name="cafe-outline" size={20} color="#1e293b" />
            <Text style={styles.modeSelectorTextClean}>Uống tại quán</Text>
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

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải menu...</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Left sidebar: categories */}
          <View style={styles.sidebar}>
            <FlatList
              ref={sidebarListRef}
              data={sections}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: spacing.xs }}
              getItemLayout={(_, index) => ({ length: 76, offset: 76 * index, index })}
              renderItem={({ item }) => {
                const isActive = item.id === activeCategory
                return (
                  <Pressable
                    onPress={() => handleSidebarPress(item.id)}
                    style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                  >
                    <View style={[styles.sidebarIconWrap, isActive && styles.sidebarIconWrapActive]}>
                      <Ionicons
                        name={iconForCategory(item.title)}
                        size={20}
                        color={isActive ? colors.primary : colors.muted}
                      />
                    </View>
                    <Text
                      style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                )
              }}
            />
          </View>

          {/* Right: product sections */}
          {sections.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>Không tìm thấy sản phẩm</Text>
              <Text style={styles.emptyText}>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</Text>
              <Pressable
                onPress={() => {
                  setSearch('')
                  setPriceFilter('ALL')
                  setSortBy('DEFAULT')
                  setOnlyAvailable(false)
                  setOnlyHot(false)
                }}
                style={styles.resetBtn}
              >
                <Text style={styles.resetBtnText}>Xóa bộ lọc</Text>
              </Pressable>
            </View>
          ) : (
            <SectionList
              ref={sectionListRef}
              sections={sections}
              keyExtractor={(item) => String(item.id || item.ma_san_pham)}
              renderItem={renderProductRow}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeaderWrap}>
                  <Text style={styles.sectionHeaderText}>{section.title}</Text>
                </View>
              )}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.listContent}
              style={{ flex: 1, backgroundColor: '#fff' }}
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
              onScrollToIndexFailed={() => { }}
            />
          )}
        </View>
      )}

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
              <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={filterStyles.applyBtnGradient}>
                <Text style={filterStyles.applyBtnText}>Áp dụng</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        visible={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false)
          setSelectedProduct(null)
        }}
        onAddToCart={handleAddToCart}
        userId={userId}
        allProducts={productsQuery.data || []}
      />

      {/* Floating Cart Button */}
      <Pressable
        onPress={() => navigation.navigate('Cart')}
        style={styles.floatingCart}
      >
        <Ionicons name="cart" size={24} color="#ea8025" />
        {cartCount > 0 ? (
          <View style={styles.floatingCartBadge}>
            <Text style={styles.floatingCartBadgeText}>{cartCount}</Text>
          </View>
        ) : null}
      </Pressable>
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
    backgroundColor: '#fff9e6',
    borderWidth: 1,
    borderColor: '#d97706',
    elevation: 1,
    shadowColor: '#ea8025',
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
    flex: 1,
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
    borderColor: '#ea8025',
    backgroundColor: '#fff',
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
    shadowColor: '#ea8025',
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
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: 'center',
  },
  contentBox: {
    width: Platform.OS === 'web' ? 480 : '100%',
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90%' : '92%',
    backgroundColor: '#fff',
    borderRadius: Platform.OS === 'web' ? 20 : 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  productHeroImg: {
    width: 180,
    height: 180,
    borderRadius: 16,
    marginBottom: 14,
  },
  productHeroPlaceholder: {
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productSummaryName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  productSummaryPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d97724',
    marginTop: 4,
    textAlign: 'center',
  },
  sectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
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
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillActive: {
    borderColor: '#d97724',
    backgroundColor: '#fff8f2',
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  pillTextActive: {
    color: '#d97724',
    fontWeight: '600',
  },
  toppingTeaser: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff8f2',
    borderWidth: 1,
    borderColor: '#ffe0c8',
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
    fontSize: 13,
    fontWeight: '600',
    color: '#d97724',
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyTextValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 28,
    textAlign: 'center',
  },
  addCartActionBtn: {
    flex: 1,
    marginLeft: 16,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#d97724',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addCartActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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