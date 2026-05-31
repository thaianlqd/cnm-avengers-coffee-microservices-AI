import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
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

function ProductDetailModal({ product, visible, onClose, onAddToCart, userId }) {
  const [selectedSize, setSelectedSize] = useState('Nhỏ')
  const [quantity, setQuantity] = useState(1)
  const sizes = ['Nhỏ', 'Vừa', 'Lớn']

  if (!product) return null

  const totalPrice = Number(product.gia_ban || 0) * quantity

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.headerTitle}>Chi tiết sản phẩm</Text>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Product Image */}
          <View style={modalStyles.imageWrap}>
            {product.hinh_anh_url ? (
              <Image source={{ uri: product.hinh_anh_url }} style={modalStyles.image} resizeMode="cover" />
            ) : (
              <View style={[modalStyles.image, modalStyles.imagePlaceholder]}>
                <Ionicons name="cafe-outline" size={64} color={colors.muted} />
              </View>
            )}
            {/* Badges */}
            <View style={modalStyles.imageBadges}>
              {product.la_hot ? <View style={modalStyles.badgeHot}><Text style={modalStyles.badgeText}>🔥 HOT</Text></View> : null}
              {product.la_moi ? <View style={modalStyles.badgeNew}><Text style={modalStyles.badgeText}>✨ MỚI</Text></View> : null}
              {product.gia_niem_yet && product.gia_niem_yet > product.gia_ban ? (
                <View style={modalStyles.badgeSale}>
                  <Text style={modalStyles.badgeText}>
                    -{Math.round((1 - product.gia_ban / product.gia_niem_yet) * 100)}%
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={modalStyles.body}>
            {/* Name & Category */}
            {product.danh_muc ? (
              <Text style={modalStyles.categoryTag}>{product.danh_muc}</Text>
            ) : null}
            <Text style={modalStyles.productName}>{product.ten_san_pham}</Text>

            {/* Price */}
            <View style={modalStyles.priceRow}>
              <Text style={modalStyles.price}>{formatCurrency(product.gia_ban)}</Text>
              {product.gia_niem_yet && product.gia_niem_yet > product.gia_ban ? (
                <Text style={modalStyles.oldPrice}>{formatCurrency(product.gia_niem_yet)}</Text>
              ) : null}
            </View>

            {/* Description */}
            {product.mo_ta ? (
              <View style={modalStyles.descWrap}>
                <Text style={modalStyles.descLabel}>Mô tả</Text>
                <Text style={modalStyles.desc}>{product.mo_ta}</Text>
              </View>
            ) : null}

            {/* Size selector */}
            <View style={modalStyles.sizeSection}>
              <Text style={modalStyles.sizeLabel}>Chọn size</Text>
              <View style={modalStyles.sizeRow}>
                {sizes.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => setSelectedSize(size)}
                    style={[modalStyles.sizeBtn, selectedSize === size && modalStyles.sizeBtnActive]}
                  >
                    <Text style={[modalStyles.sizeBtnText, selectedSize === size && modalStyles.sizeBtnTextActive]}>
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Quantity */}
            <View style={modalStyles.qtySection}>
              <Text style={modalStyles.qtyLabel}>Số lượng</Text>
              <View style={modalStyles.qtyRow}>
                <Pressable
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  style={modalStyles.qtyBtn}
                >
                  <Ionicons name="remove" size={20} color={colors.text} />
                </Pressable>
                <Text style={modalStyles.qtyValue}>{quantity}</Text>
                <Pressable
                  onPress={() => setQuantity(quantity + 1)}
                  style={modalStyles.qtyBtn}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Total */}
            <View style={modalStyles.totalRow}>
              <Text style={modalStyles.totalLabel}>Tổng cộng</Text>
              <Text style={modalStyles.totalValue}>{formatCurrency(totalPrice)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Add to Cart Button */}
        <View style={modalStyles.footer}>
          <Pressable
            onPress={() => {
              onAddToCart(product, quantity, selectedSize)
              onClose()
            }}
            style={({ pressed }) => [modalStyles.addBtn, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={modalStyles.addBtnGradient}>
              <Ionicons name="bag-add-outline" size={20} color="#fff" />
              <Text style={modalStyles.addBtnText}>Thêm vào giỏ · {formatCurrency(totalPrice)}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

export function MenuScreen({ navigation }) {
  const { user } = useUser()
  const userId = getUserId(user)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [priceFilter, setPriceFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('DEFAULT')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyHot, setOnlyHot] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

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

  const categories = useMemo(
    () => [{ id: 'all', label: 'Tất cả', code: 'all' }, ...(categoriesQuery.data || [])],
    [categoriesQuery.data]
  )

  const filteredProducts = useMemo(() => {
    let list = [...(productsQuery.data || [])]

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter(p =>
        String(p.danh_muc_id) === String(selectedCategory) ||
        String(p.danh_muc_id) === selectedCategory
      )
    }

    // Search
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      list = list.filter(p =>
        String(p.ten_san_pham || '').toLowerCase().includes(kw) ||
        String(p.mo_ta || '').toLowerCase().includes(kw) ||
        String(p.danh_muc || '').toLowerCase().includes(kw)
      )
    }

    // Price
    if (priceFilter === 'DUOI_30000') list = list.filter(p => p.gia_ban < 30000)
    else if (priceFilter === 'TU_30000_DEN_50000') list = list.filter(p => p.gia_ban >= 30000 && p.gia_ban <= 50000)
    else if (priceFilter === 'TREN_50000') list = list.filter(p => p.gia_ban > 50000)

    // Available
    if (onlyAvailable) list = list.filter(p => Boolean(p.trang_thai))

    // Hot
    if (onlyHot) list = list.filter(p => Boolean(p.la_hot))

    // Sort
    if (sortBy === 'PRICE_ASC') list.sort((a, b) => a.gia_ban - b.gia_ban)
    else if (sortBy === 'PRICE_DESC') list.sort((a, b) => b.gia_ban - a.gia_ban)
    else if (sortBy === 'NAME_ASC') list.sort((a, b) => a.ten_san_pham.localeCompare(b.ten_san_pham, 'vi'))

    return list
  }, [productsQuery.data, selectedCategory, search, priceFilter, sortBy, onlyAvailable, onlyHot])

  const addToCartMutation = useMutation({
    mutationFn: async ({ item, quantity, size }) => apiClient.post('/cart', {
      ma_nguoi_dung: userId,
      ma_san_pham: item.ma_san_pham,
      ten_san_pham: item.ten_san_pham,
      gia_ban: item.gia_ban,
      hinh_anh_url: item.hinh_anh_url,
      size: size || 'Nhỏ',
      so_luong: quantity || 1,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      await queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId, 'count'] })
      Alert.alert('✓ Đã thêm vào giỏ', 'Sản phẩm đã được thêm vào giỏ hàng của bạn.')
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error?.message || 'Không thể thêm vào giỏ.'
      Alert.alert('Lỗi', message)
    },
  })

  const handleAddToCart = (item, quantity = 1, size = 'Nhỏ') => {
    if (!userId) {
      Alert.alert('Chưa đăng nhập', 'Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.')
      return
    }
    addToCartMutation.mutate({ item, quantity, size })
  }

  const activeFiltersCount = [
    priceFilter !== 'ALL',
    onlyAvailable,
    onlyHot,
    sortBy !== 'DEFAULT',
  ].filter(Boolean).length

  const renderProductItem = ({ item }) => (
    <Pressable
      onPress={() => {
        setSelectedProduct(item)
        setIsDetailOpen(true)
      }}
      style={({ pressed }) => [styles.itemCard, shadows.sm, pressed && { opacity: 0.92 }]}
    >
      {item.hinh_anh_url ? (
        <Image source={{ uri: item.hinh_anh_url }} style={styles.itemImage} resizeMode="cover" />
      ) : (
        <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
          <Ionicons name="cafe-outline" size={28} color={colors.muted} />
        </View>
      )}
      <View style={styles.itemInfo}>
        {/* Badges */}
        <View style={styles.badgeRow}>
          {item.la_hot ? <View style={styles.badgeHot}><Text style={styles.badgeText}>🔥HOT</Text></View> : null}
          {item.la_moi ? <View style={styles.badgeNew}><Text style={styles.badgeText}>✨MỚI</Text></View> : null}
          {item.gia_niem_yet && item.gia_niem_yet > item.gia_ban ? (
            <View style={styles.badgeSale}>
              <Text style={styles.badgeText}>
                -{Math.round((1 - item.gia_ban / item.gia_niem_yet) * 100)}%
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.itemName} numberOfLines={2}>{item.ten_san_pham}</Text>
        {item.mo_ta ? <Text style={styles.itemDesc} numberOfLines={1}>{item.mo_ta}</Text> : null}
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{formatCurrency(item.gia_ban)}</Text>
          {item.gia_niem_yet && item.gia_niem_yet > item.gia_ban ? (
            <Text style={styles.itemOldPrice}>{formatCurrency(item.gia_niem_yet)}</Text>
          ) : null}
        </View>
        <View style={styles.itemFooter}>
          {item.danh_muc ? <Text style={styles.itemCategory}>{item.danh_muc}</Text> : null}
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.()
              handleAddToCart(item, 1, 'Nhỏ')
            }}
            style={({ pressed }) => [styles.quickAddBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.quickAddText}>Thêm</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  )

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Menu</Text>
            <Text style={styles.headerSubtitle}>{filteredProducts.length} sản phẩm</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Cart')}
            style={styles.cartBtn}
          >
            <Ionicons name="bag-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm sản phẩm, ví dụ: espresso, matcha..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
            </Pressable>
          ) : null}
        </View>

        {/* Filter button */}
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowFilterPanel(true)}
            style={[styles.filterBtn, activeFiltersCount > 0 && styles.filterBtnActive]}
          >
            <Ionicons name="options-outline" size={16} color={activeFiltersCount > 0 ? '#fff' : 'rgba(255,255,255,0.8)'} />
            <Text style={[styles.filterBtnText, activeFiltersCount > 0 && { color: '#fff' }]}>
              Lọc {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Category tabs */}
      <View style={styles.categoryBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => {
            const isActive = String(item.id) === String(selectedCategory)
            return (
              <Pressable
                onPress={() => setSelectedCategory(String(item.id))}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              >
                {item.icon ? <Text style={styles.categoryIcon}>{item.icon}</Text> : null}
                <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          }}
        />
      </View>

      {/* Loading */}
      {productsQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải menu...</Text>
        </View>
      ) : null}

      {/* Empty State */}
      {!productsQuery.isLoading && filteredProducts.length === 0 ? (
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
              setSelectedCategory('all')
            }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetBtnText}>Xóa bộ lọc</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Product List */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => String(item.id || item.ma_san_pham)}
        renderItem={renderProductItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

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
      />
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontWeight: '500',
  },
  cartBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: spacing.sm,
  },
  searchIcon: {
    marginRight: 10,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBtnText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },

  // Category
  categoryBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  categoryLabelActive: {
    color: '#fff',
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
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.md,
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

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },

  // Item Card
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemImage: {
    width: 100,
    height: 110,
    backgroundColor: colors.cream,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    padding: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  badgeHot: {
    backgroundColor: '#ef4444',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeNew: {
    backgroundColor: '#0ea5e9',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeSale: {
    backgroundColor: '#22c55e',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 20,
  },
  itemDesc: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
  },
  itemOldPrice: {
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  itemCategory: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600',
    flex: 1,
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickAddText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
})

// Product Detail Modal Styles
const modalStyles = StyleSheet.create({
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
  headerTitle: {
    fontSize: 18,
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
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 260,
    backgroundColor: colors.cream,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBadges: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    gap: 6,
  },
  badgeHot: {
    backgroundColor: '#ef4444',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeNew: {
    backgroundColor: '#0ea5e9',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeSale: {
    backgroundColor: '#22c55e',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  categoryTag: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  price: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.primary,
  },
  oldPrice: {
    fontSize: 16,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  descWrap: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  descLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  desc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  sizeSection: {
    gap: spacing.sm,
  },
  sizeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sizeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  sizeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#fff4ec',
  },
  sizeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  sizeBtnTextActive: {
    color: colors.primary,
    fontWeight: '900',
  },
  qtySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: 4,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    minWidth: 28,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff4ec',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#ffe0c8',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  addBtn: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  addBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
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
