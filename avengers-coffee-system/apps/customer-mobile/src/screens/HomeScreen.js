import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getUserDisplayName,
  getUserId,
  normalizeBranch,
  normalizeCartItem,
  normalizeCategory,
  normalizeNewsArticle,
  normalizeProduct,
  safeArray,
} from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

const MEMBERSHIP_CONFIG = {
  MEMBER: { label: 'Thành viên', color: '#9ca3af', bg: '#f9fafb', icon: '🎖️', nextLabel: 'Silver' },
  SILVER: { label: 'Bạc', color: '#64748b', bg: '#f8fafc', icon: '🥈', nextLabel: 'Gold' },
  GOLD: { label: 'Vàng', color: '#d97706', bg: '#fffbeb', icon: '🥇', nextLabel: 'Diamond' },
  DIAMOND: { label: 'Kim Cương', color: '#0ea5e9', bg: '#f0f9ff', icon: '💎', nextLabel: null },
}

const PROMO_BANNERS = [
  'https://minio.thecoffeehouse.com/image/admin/1782874392_web-order-1125x1380.jpg',
  'https://minio.thecoffeehouse.com/image/admin/1773299424_web-order-1125x1380.jpg',
  'https://minio.thecoffeehouse.com/image/admin/1779874619_web-order-1125x1380.jpg',
  'https://minio.thecoffeehouse.com/image/admin/1783567420_web-order-1125x1380-1.jpg'
]

function TopPromoBanner() {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % PROMO_BANNERS.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={styles.topPromoWrap}>
      <Image 
        source={{ uri: PROMO_BANNERS[currentIndex] }} 
        style={styles.topPromoImage} 
        resizeMode="cover" 
      />
      <View style={styles.promoDots}>
        {PROMO_BANNERS.map((_, i) => (
          <View key={i} style={[styles.promoDot, i === currentIndex && styles.promoDotActive]} />
        ))}
      </View>
    </View>
  )
}

function SearchBar({ onPress }) {
  const fullText = "Một chỗ ngồi, ngàn tâm trạng."
  const [text, setText] = useState("")
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    let i = 0
    let timer = null
    const typeWriter = () => {
      if (i < fullText.length) {
        setText(fullText.substring(0, i + 1))
        i++
        timer = setTimeout(typeWriter, 100)
      } else {
        timer = setTimeout(() => {
          i = 0
          setText("")
          typeWriter()
        }, 3000)
      }
    }
    typeWriter()
    return () => clearTimeout(timer)
  }, [fullText])

  useEffect(() => {
    const cursorTimer = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    return () => clearInterval(cursorTimer)
  }, [])

  return (
    <View style={styles.searchBarContainer}>
      <Pressable onPress={onPress} style={styles.searchBar}>
        <Text style={styles.searchBarText}>{text}<Text style={showCursor ? styles.cursorVisible : styles.cursorHidden}>|</Text></Text>
        <View style={styles.searchBarIconWrap}>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </View>
      </Pressable>
    </View>
  )
}

function MockProminentNewsCard({ onPress }) {
  return (
    <View style={styles.prominentNewsContainer}>
      <Text style={styles.prominentNewsTitle}>TIN TỨC</Text>
      <Pressable onPress={onPress} style={styles.mockNewsCard}>
        <Image 
          source={{ uri: 'https://feed.thecoffeehouse.com//content/images/2026/06/Da-y--eo-Proudly-Real.jpg' }}
          style={styles.mockNewsImage}
          resizeMode="cover"
        />
        <View style={styles.mockNewsContent}>
          <View style={styles.mockNewsMetaRow}>
            <Text style={styles.mockNewsCategory}>COFFEEHOLIC</Text>
            <Text style={styles.mockNewsDate}>06/06/2026</Text>
          </View>
          <Text style={styles.mockNewsTitle}>🌈 THÁNG TỰ HÀO, NHÀ TẶNG DÂY ĐEO TỰ...</Text>
          <Text style={styles.mockNewsDesc} numberOfLines={2}>Tháng Tự Hào này, Nhà tặng Homies một "người bạn đồng hành" nhỏ xinh nhưng đầy ý nghĩa: Dây đeo Tự hào. Không chỉ đơn thuần là một chiếc dây đeo, đây là thông điệp mà...</Text>
        </View>
        <View style={styles.mockNewsDots}>
           <View style={styles.mockNewsDotActive} />
           <View style={styles.mockNewsDot} />
           <View style={styles.mockNewsDot} />
        </View>
      </Pressable>
    </View>
  )
}

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

function HomeMenuSection({ navigation }) {
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
      }))
    },
    staleTime: 60 * 1000,
  })

  const allCategories = categoriesQuery.data || []
  const products = productsQuery.data || []
  const categories = useMemo(() => {
    return allCategories.filter(cat => products.some(p => String(p.danh_muc_id) === String(cat.id)))
  }, [allCategories, products])
  
  const [activeCat, setActiveCat] = useState(null)

  const currentCat = activeCat || (categories.length > 0 ? categories[0].id : null)

  const displayProducts = products.filter(p => String(p.danh_muc_id) === String(currentCat))

  if (!categories.length || !products.length) return null

  return (
    <View style={styles.mockMenuContainer}>
      <View style={styles.mockMenuSearchWrap}>
        <Pressable style={styles.mockMenuSearch} onPress={() => navigation.navigate('Menu')}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <Text style={styles.mockMenuSearchText}>Tìm món</Text>
        </Pressable>
      </View>

      <View style={styles.mockMenuLayout}>
        <View style={styles.mockMenuSidebar}>
          {categories.map((cat, i) => {
            const isActive = currentCat === cat.id
            return (
              <Pressable
                key={cat.id}
                onPress={() => setActiveCat(cat.id)}
                style={[styles.mockMenuCat, isActive && styles.mockMenuCatActive]}
              >
                <View style={[styles.mockMenuCatIconWrap, isActive && styles.mockMenuCatIconWrapActive]}>
                  <Ionicons name={iconForCategory(cat.label)} size={22} color={isActive ? '#ea8025' : '#666666'} />
                </View>
                {i === 0 && (
                  <View style={styles.mockMenuCatBadge}><Text style={styles.mockMenuCatBadgeText}>NEW</Text></View>
                )}
                <Text style={[styles.mockMenuCatText, isActive && styles.mockMenuCatTextActive]} numberOfLines={2}>{cat.label}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.mockMenuContent}>
           <View style={styles.mockMenuSectionHeader}>
             <Text style={styles.mockMenuSectionTitle}>{categories.find(c => c.id === currentCat)?.label || 'Sản phẩm'}</Text>
           </View>
           {displayProducts.map(p => (
             <Pressable
               key={p.id || p.ma_san_pham}
               onPress={() => navigation.navigate('Menu', { selectedProduct: p })}
               style={styles.mockMenuProductCard}
             >
               {p.hinh_anh_url ? (
                  <Image source={{uri: p.hinh_anh_url}} style={styles.mockMenuProductImage} resizeMode="cover" />
               ) : (
                  <View style={[styles.mockMenuProductImage, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="cafe-outline" size={24} color={colors.muted} />
                  </View>
               )}
               <View style={styles.mockMenuProductInfo}>
                 <Text style={styles.mockMenuProductName} numberOfLines={2}>{p.ten_san_pham}</Text>
                 <Text style={styles.mockMenuProductPrice}>{formatCurrency(p.gia_ban)}</Text>
               </View>
               <Pressable
                 onStartShouldSetResponder={() => true}
                 onPress={(e) => {
                   if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
                   if (e && typeof e.preventDefault === 'function') e.preventDefault()
                   navigation.navigate('Menu', { selectedProduct: p })
                 }}
                 style={styles.mockMenuAddBtn}
               >
                 <Ionicons name="add" size={18} color="#ea8025" />
               </Pressable>
             </Pressable>
           ))}
           {displayProducts.length === 0 && (
              <Text style={{padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13}}>Chưa có sản phẩm</Text>
           )}
        </View>
      </View>
    </View>
  )
}

// Rounded pill showing loyalty points, mirrors TCH's orange-bordered home pill
function PointsPill({ diemLoyalty, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pointsPill, pressed && { opacity: 0.9 }]}>
      <Text style={styles.pointsPillIcon}>🏆</Text>
      <Text style={styles.pointsPillText} numberOfLines={1}>
        {diemLoyalty.toLocaleString('vi-VN')} điểm tích lũy · Xem ưu đãi
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </Pressable>
  )
}

function SectionHeader({ title, icon, onSeeAll }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>Xem tất cả</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      )}
    </View>
  )
}

function ProductCard({ item, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.productCard, shadows.card, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.productImageWrap}>
        {item.hinh_anh_url ? (
          <Image source={{ uri: item.hinh_anh_url }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Ionicons name="cafe-outline" size={28} color={colors.muted} />
          </View>
        )}
        <View style={styles.productBadges}>
          {item.la_hot ? <View style={styles.badgeHot}><Text style={styles.badgeText}>🔥HOT</Text></View> : null}
          {item.la_moi ? <View style={styles.badgeNew}><Text style={styles.badgeText}>✨MỚI</Text></View> : null}
        </View>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.ten_san_pham}</Text>
        {item.gia_niem_yet && item.gia_niem_yet > item.gia_ban ? (
          <Text style={styles.productOldPrice}>{formatCurrency(item.gia_niem_yet)}</Text>
        ) : null}
        <Text style={styles.productPrice}>{formatCurrency(item.gia_ban)}</Text>
      </View>
    </Pressable>
  )
}

function VoucherCard({ voucher }) {
  const type = String(voucher?.loai_khuyen_mai || '').toUpperCase()
  const typeConfig = {
    PERCENT: { color: '#22c55e', bg: '#f0fdf4', label: 'Giảm %' },
    FIXED: { color: '#0ea5e9', bg: '#f0f9ff', label: 'Giảm tiền' },
    FREE_ITEM: { color: '#a855f7', bg: '#faf5ff', label: 'Tặng kèm' },
  }
  const tc = typeConfig[type] || { color: colors.primary, bg: '#fff9f5', label: 'Ưu đãi' }

  return (
    <View style={[styles.voucherCard, shadows.sm]}>
      <View style={[styles.voucherBadge, { backgroundColor: tc.bg }]}>
        <Text style={[styles.voucherBadgeText, { color: tc.color }]}>{tc.label}</Text>
      </View>
      <View style={styles.voucherDividerLine} />
      <View style={styles.voucherContent}>
        <View style={styles.voucherCodeRow}>
          <Ionicons name="ticket-outline" size={16} color={colors.primary} />
          <Text style={styles.voucherCode}>{voucher.ma_khuyen_mai}</Text>
        </View>
        <Text style={styles.voucherName} numberOfLines={1}>{voucher.ten_khuyen_mai || voucher.ma_khuyen_mai}</Text>
        <Text style={styles.voucherDate}>
          HSD: {formatDateOnly(voucher.ngay_ket_thuc) || 'Không giới hạn'}
        </Text>
      </View>
    </View>
  )
}

function BranchCard({ branch }) {
  return (
    <View style={[styles.branchCard, shadows.sm]}>
      {branch.hinh_anh_url ? (
        <Image source={{ uri: branch.hinh_anh_url }} style={styles.branchImage} resizeMode="cover" />
      ) : (
        <View style={[styles.branchImage, styles.branchImagePlaceholder]}>
          <Ionicons name="storefront-outline" size={28} color={colors.muted} />
        </View>
      )}
      <View style={styles.branchInfo}>
        <Text style={styles.branchName} numberOfLines={1}>{branch.ten_chi_nhanh}</Text>
        <View style={styles.branchRow}>
          <Ionicons name="location-outline" size={12} color={colors.muted} />
          <Text style={styles.branchAddress} numberOfLines={2}>{branch.dia_chi}</Text>
        </View>
        <View style={styles.branchRow}>
          <Ionicons name="time-outline" size={12} color={colors.muted} />
          <Text style={styles.branchHours}>{branch.gio_mo_cua} - {branch.gio_dong_cua}</Text>
        </View>
      </View>
    </View>
  )
}

function NewsCard({ article, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(article)}
      style={({ pressed }) => [styles.newsCard, shadows.sm, pressed && { opacity: 0.9 }]}
    >
      {article.image_url ? (
        <Image source={{ uri: article.image_url }} style={styles.newsImage} resizeMode="cover" />
      ) : (
        <View style={[styles.newsImage, styles.newsImagePlaceholder]}>
          <Ionicons name="newspaper-outline" size={24} color={colors.muted} />
        </View>
      )}
      <View style={styles.newsInfo}>
        {article.category ? (
          <View style={styles.newsCategoryBadge}>
            <Text style={styles.newsCategoryText}>{article.category}</Text>
          </View>
        ) : null}
        <Text style={styles.newsTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.newsDesc} numberOfLines={2}>{article.description}</Text>
        <View style={styles.newsMeta}>
          <Ionicons name="eye-outline" size={12} color={colors.muted} />
          <Text style={styles.newsMetaText}>{article.views} lượt xem</Text>
          <Text style={styles.newsMetaDot}>·</Text>
          <Text style={styles.newsMetaText}>{formatDateTime(article.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  )
}

function TopHeader() {
  const navigation = useNavigation()
  const { user } = useUser()
  const isGuest = !user || getUserId(user) === 'guest-customer'

  return (
    <View style={styles.topHeaderContainer}>
      <Pressable onPress={() => navigation.navigate('Stores')} hitSlop={12}>
        <Ionicons name="storefront-outline" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.topHeaderPill}>
        <Text style={styles.topHeaderPillText}>The Coffee House</Text>
        <Ionicons name="chevron-down" size={16} color={colors.text} />
      </View>
      <Pressable
        onPress={() => {
          if (isGuest) {
            navigation.navigate('Login')
          } else {
            navigation.navigate('Profile')
          }
        }}
        hitSlop={12}
      >
        <Ionicons
          name={isGuest ? 'log-in-outline' : 'person-circle-outline'}
          size={26}
          color={isGuest ? '#ea8025' : colors.text}
        />
      </Pressable>
    </View>
  )
}

export function HomeScreen({ navigation }) {
  const { user, activeUserId } = useUser()
  const userId = getUserId(user, activeUserId)
  const queryClient = useQueryClient()

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
    onError: () => {},
  })

  const handleAddToCart = (item, quantity = 1, size = 'Nhỏ', options = {}) => {
    if (!item) return
    const targetUserId = userId || activeUserId || 'guest-customer'
    addToCartMutation.mutate({ item, quantity, size, options, targetUserId })
    const toppingInfo = Array.isArray(options?.toppings) && options.toppings.length > 0 ? ` + ${options.toppings.join(', ')}` : ''
    Alert.alert('✓ Đã thêm vào giỏ', `${item.ten_san_pham} (${quantity}x Size ${size || 'Nhỏ'}${toppingInfo}) đã được thêm vào giỏ.`)
  }

  const loyaltyQuery = useQuery({
    queryKey: ['customer', 'loyalty', userId],
    queryFn: async () => apiClient.get(`/users/${userId}/loyalty`),
    enabled: Boolean(userId),
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

  const featuredProductsQuery = useQuery({
    queryKey: ['customer', 'featured-products'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/san-pham')
      const rows = safeArray(response)
      return rows
        .filter(p => Boolean(p.la_hot) || Boolean(p.la_moi) || Number(p.gia_niem_yet || 0) > Number(p.gia_ban || 0))
        .slice(0, 10)
        .map(normalizeProduct)
    },
    staleTime: 60 * 1000,
  })

  const allProductsQuery = useQuery({
    queryKey: ['customer', 'all-products-home'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/san-pham')
      return safeArray(response).map(normalizeProduct)
    },
    staleTime: 5 * 60 * 1000,
  })

  const aiRecsQuery = useQuery({
    queryKey: ['customer', 'ai-recs', userId || 'anon-popular'],
    queryFn: async () => {
      const targetId = userId || 'anon-popular'
      const res = await apiClient.get(`/ai/recommend/${encodeURIComponent(targetId)}?limit=3`)
      return {
        items: safeArray(res?.items).slice(0, 3).map(item => ({
          ma_san_pham: item.id,
          ten_san_pham: item.name || item.ten_san_pham || '',
          gia_ban: Number(item.price || item.gia_ban || 0),
          hinh_anh_url: item.image || item.hinh_anh_url || '',
          la_hot: Boolean(item.la_hot),
          la_moi: Boolean(item.la_moi),
          gia_niem_yet: null,
          danh_muc: item.category,
        })),
        is_personalized: Boolean(res?.is_personalized)
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })

  // Same logic as web-customer for behavior insights
  const behaviorInsightsQuery = useQuery({
    queryKey: ['ai', 'behavior-insights', 'customer-sync', 30],
    queryFn: async () => {
      const res = await apiClient.get('/ai/behavior/insights?branch_code=ALL&limit=5&days=30')
      return res
    },
    staleTime: 3 * 60 * 1000,
    retry: 0,
  })

  const branchesQuery = useQuery({
    queryKey: ['customer', 'branches-public'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public')
      return safeArray(response?.items || response).map(normalizeBranch).slice(0, 3)
    },
    staleTime: 5 * 60 * 1000,
  })

  const newsQuery = useQuery({
    queryKey: ['customer', 'news-home'],
    queryFn: async () => {
      const response = await apiClient.get('/news?limit=5')
      return safeArray(response?.items || response).map(normalizeNewsArticle).slice(0, 5)
    },
    staleTime: 60 * 1000,
  })

  const vouchersQuery = useQuery({
    queryKey: ['customer', 'vouchers', userId],
    queryFn: async () => {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
      const res = await apiClient.get(`/promotions/vouchers${q}`)
      return safeArray(res?.items || res).slice(0, 4)
    },
    staleTime: 60 * 1000,
  })

  const loyalty = loyaltyQuery.data || null
  const products = featuredProductsQuery.data || []
  const aiRecsData = aiRecsQuery.data || { items: [], is_personalized: false }
  const aiRecs = aiRecsData.items
  const branches = branchesQuery.data || []
  const news = newsQuery.data || []
  const vouchers = vouchersQuery.data || []

  const isLoading = featuredProductsQuery.isPending

  const handleProductPress = (item) => {
    navigation.navigate('Menu')
  }

  const displayTop3Products = useMemo(() => {
    const behaviorInsightsData = behaviorInsightsQuery.data
    const behaviorTopSource = behaviorInsightsData?.customer_sync_top_products?.length
      ? behaviorInsightsData.customer_sync_top_products
      : behaviorInsightsData?.top_products || []

    const behaviorTop = behaviorTopSource.slice(0, 3)
    const allProducts = allProductsQuery.data || []

    let syncedBehaviorTop3Products = []
    if (behaviorTop.length > 0) {
      syncedBehaviorTop3Products = behaviorTop.map(item => {
        const productId = String(item?.product_id || '')
        const fromMenu = allProducts.find(p => String(p.ma_san_pham) === productId)
        if (fromMenu) return fromMenu
        return {
          ma_san_pham: productId || String(item?.product_name || 'behavior-item'),
          ten_san_pham: String(item?.product_name || 'Sản phẩm gợi ý'),
          gia_ban: 0,
          hinh_anh_url: '',
          trang_thai: true,
          danh_muc: 'Đồng bộ hành vi',
        }
      })
    }

    let aiRecommendedProducts = []
    if (aiRecs.length > 0) {
      aiRecommendedProducts = aiRecs.map(item => {
        const fromMenu = allProducts.find(p => String(p.ma_san_pham) === String(item.ma_san_pham))
        return fromMenu || item
      })
    }

    return syncedBehaviorTop3Products.length > 0 ? syncedBehaviorTop3Products : aiRecommendedProducts
  }, [behaviorInsightsQuery.data, aiRecs, allProductsQuery.data])

  const handleNewsPress = (article) => {
    navigation.navigate('News', { article })
  }

  const tier = loyalty?.hang_thanh_vien?.ma_hang || user?.membership_tier || 'MEMBER'
  const membershipConfig = MEMBERSHIP_CONFIG[tier] || MEMBERSHIP_CONFIG.MEMBER
  const diemLoyalty = Number(loyalty?.diem ?? user?.loyalty_points ?? 0)

  const banners = useMemo(() => {
    const list = [
      {
        id: 'loyalty',
        eyebrow: `${membershipConfig.icon} HẠNG ${membershipConfig.label.toUpperCase()}`,
        title: `Xin chào, ${getUserDisplayName(user)}`,
        subtitle: `Bạn đang có ${diemLoyalty.toLocaleString('vi-VN')} điểm tích lũy`,
        colors: ['#1a0a02', '#3d1a08', '#f26b1d'],
      },
    ]
    vouchers.slice(0, 3).forEach((v) => {
      list.push({
        id: String(v.ma_khuyen_mai || v.id),
        eyebrow: 'ƯU ĐÃI DÀNH CHO BẠN',
        title: v.ten_khuyen_mai || 'Ưu đãi hấp dẫn',
        subtitle: `Nhập mã ${v.ma_khuyen_mai} khi đặt hàng`,
        colors: ['#7c2d12', '#c2410c', '#f26b1d'],
      })
    })
    if (list.length === 1) {
      list.push({
        id: 'welcome',
        eyebrow: 'AVENGERS COFFEE',
        title: 'Hương vị ngọt ngào mỗi ngày',
        subtitle: 'Đặt hàng ngay để nhận ưu đãi mới nhất',
        colors: ['#3d1a08', '#d4560e', '#ff9e64'],
      })
    }
    return list
  }, [membershipConfig, diemLoyalty, user, vouchers])

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TopHeader />
        <TopPromoBanner />
      <SearchBar onPress={() => navigation.navigate('Menu')} />
      <MockProminentNewsCard onPress={() => navigation.navigate('News')} />
      <HomeMenuSection navigation={navigation} />

      {false && (
        <React.Fragment>
          {/* Loyalty points pill */}
          <PointsPill diemLoyalty={diemLoyalty} onPress={() => navigation.navigate('Vouchers')} />

      {/* Quick Actions */}
      <View style={styles.quickActionsCard}>
        <Pressable
          onPress={() => navigation.navigate('Menu')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#fff1e8' }]}>
            <Ionicons name="restaurant-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.quickActionLabel}>Menu</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Cart')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#eafaf0' }]}>
            <Ionicons name="bag-outline" size={22} color="#16a34a" />
          </View>
          <Text style={styles.quickActionLabel}>Giỏ hàng</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Orders')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#eaf6fd' }]}>
            <Ionicons name="receipt-outline" size={22} color="#0284c7" />
          </View>
          <Text style={styles.quickActionLabel}>Đơn hàng</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Vouchers')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#f6effc' }]}>
            <Ionicons name="gift-outline" size={22} color="#9333ea" />
          </View>
          <Text style={styles.quickActionLabel}>Voucher</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Chat')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#fdeef5' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#db2777" />
          </View>
          <Text style={styles.quickActionLabel}>Hỗ trợ</Text>
        </Pressable>
      </View>

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
        </View>
      ) : null}

      {/* AI Recommendations - Web Style */}
      {displayTop3Products.length > 0 ? (
        <View style={styles.aiRecsContainer}>
          <View style={styles.aiRecsHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiRecsSubLabel}>SMART RECOMMENDATION</Text>
              <Text style={styles.aiRecsTitle}>
                {userId ? 'TOP 3 MÓN HỢP GU CỦA BẠN' : 'TOP 3 MÓN PHỔ BIẾN'}
              </Text>
              <Text style={styles.aiRecsDesc}>
                {aiRecsData.is_personalized
                  ? 'Cá nhân hóa theo lịch sử mua hàng, đánh giá, yêu thích và xu hướng dùng ưu đãi.'
                  : userId
                    ? 'Chưa đủ lịch sử, hiển thị các món phổ biến.'
                    : 'Đang xem gợi ý cho khách vãng lai, dựa trên độ phổ biến toàn hệ thống.'}
              </Text>
              <Text style={styles.aiRecsSyncLabel}>DONG BO CUSTOMER VOI TOP HANH VI 30 NGAY</Text>
            </View>
            <View style={styles.aiRecsBadge}>
              <Text style={styles.aiRecsBadgeText}>
                {aiRecsData.is_personalized ? 'AI PERSONAL' : 'AI POPULAR'}
              </Text>
            </View>
          </View>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={displayTop3Products}
            keyExtractor={(item) => String(item.ma_san_pham || item.id)}
            contentContainerStyle={styles.aiRecsListContent}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleProductPress(item)}
                style={({ pressed }) => [styles.aiRecsCard, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.aiRecsImageWrap}>
                  {item.hinh_anh_url || item.image ? (
                    <Image source={{ uri: item.hinh_anh_url || item.image }} style={styles.aiRecsImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.aiRecsImage, styles.itemImagePlaceholder]}>
                      <Ionicons name="cafe-outline" size={32} color={colors.muted} />
                    </View>
                  )}
                  <Pressable style={styles.aiRecsLikeBtn}>
                    <Ionicons name="heart" size={16} color="#ef4444" />
                  </Pressable>
                </View>

                <View style={styles.aiRecsInfo}>
                  <Text style={styles.aiRecsCategory} numberOfLines={1}>{item.danhMuc?.ten_danh_muc || item.danh_muc || item.category || 'Gợi ý AI'}</Text>
                  <Text style={styles.aiRecsName} numberOfLines={1}>{item.ten_san_pham || item.name}</Text>
                  <Text style={styles.aiRecsPrice}>{formatCurrency(Number(item.gia_ban || item.price || 0))}</Text>

                  <View style={styles.aiRecsActions}>
                    <Pressable
                      style={styles.aiRecsBtnOutline}
                      onPress={() => handleProductPress(item)}
                    >
                      <Text style={styles.aiRecsBtnOutlineText}>CHI TIẾT</Text>
                    </Pressable>
                    <Pressable
                      style={styles.aiRecsBtnSolid}
                      onPress={() => handleProductPress(item)}
                    >
                      <Text style={styles.aiRecsBtnSolidText}>THÊM</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {/* Featured Products */}
      {products.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Sản phẩm nổi bật" icon="🔥" onSeeAll={() => navigation.navigate('Menu')} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={products}
            keyExtractor={(item) => String(item.id || item.ma_san_pham)}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }) => <ProductCard item={item} onPress={handleProductPress} />}
          />
        </View>
      ) : null}

      {/* Vouchers */}
      {vouchers.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Ưu đãi dành cho bạn" icon="🎟️" onSeeAll={() => navigation.navigate('Vouchers')} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={vouchers}
            keyExtractor={(item) => String(item.ma_khuyen_mai || item.id)}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }) => <VoucherCard voucher={item} />}
          />
        </View>
      ) : null}

      {/* Branches */}
      {branches.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Chi nhánh gần bạn" icon="📍" onSeeAll={() => navigation.navigate('Stores')} />
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} />
          ))}
        </View>
      ) : null}

      {/* News */}
      {news.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Tin tức & Câu chuyện" icon="📰" onSeeAll={() => navigation.navigate('News')} />
          {news.slice(0, 3).map((article) => (
            <NewsCard key={article.id} article={article} onPress={handleNewsPress} />
          ))}
        </View>
      ) : null}

          {/* Footer brand */}
          <View style={styles.footerBrand}>
            <Text style={styles.footerBrandText}>☕ Avengers Coffee</Text>
            <Text style={styles.footerBrandSub}>Hương vị ngọt ngào mỗi ngày</Text>
          </View>
        </React.Fragment>
      )}
    </ScrollView>

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

const PRODUCT_CARD_WIDTH = 160

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingBottom: 24,
    backgroundColor: '#fff',
  },

  topHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  topHeaderPill: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topHeaderPillText: {
    fontWeight: '700',
    marginRight: 4,
    color: colors.text,
  },

  // Top Promo Banner
  topPromoWrap: {
    width: '100%',
    aspectRatio: 1125 / 1380,
    position: 'relative',
  },
  promoDots: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  promoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  promoDotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  cursorVisible: {
    opacity: 1,
    color: colors.primary,
  },
  cursorHidden: {
    opacity: 0,
    color: colors.primary,
  },
  topPromoImage: {
    width: '100%',
    height: '100%',
  },

  // Search Bar
  searchBarContainer: {
    marginTop: -28,
    paddingHorizontal: spacing.md,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...shadows.card,
  },
  searchBarText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  searchBarIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Prominent News Card
  prominentNewsContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  prominentNewsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  mockNewsCard: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  mockNewsImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mockNewsContent: {
    padding: spacing.md,
  },
  mockNewsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  mockNewsCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  mockNewsDate: {
    fontSize: 10,
    color: colors.muted,
  },
  mockNewsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  mockNewsDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  mockNewsDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: spacing.md,
  },
  mockNewsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
  },
  mockNewsDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  mockMenuContainer: {
    marginTop: spacing.md,
    backgroundColor: '#fff',
  },
  mockMenuSearchWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mockMenuSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  mockMenuSearchText: {
    fontSize: 14,
    color: '#8f8f8f',
  },
  mockMenuLayout: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#f2f2f2',
    backgroundColor: '#fff',
  },
  mockMenuSidebar: {
    width: 96,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderColor: '#f2f2f2',
    paddingTop: 8,
  },
  mockMenuCat: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 12,
  },
  mockMenuCatActive: {
    backgroundColor: '#fff9e6',
    borderWidth: 1,
    borderColor: '#d97706',
    elevation: 1,
    shadowColor: '#ea8025',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  mockMenuCatIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mockMenuCatIconWrapActive: {
    backgroundColor: '#fff',
  },
  mockMenuCatText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4a4a4a',
    textAlign: 'center',
    lineHeight: 14,
  },
  mockMenuCatTextActive: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
  mockMenuCatBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff8f3',
    borderWidth: 1,
    borderColor: '#ea8025',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    zIndex: 2,
  },
  mockMenuCatBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#ea8025',
  },
  mockMenuContent: {
    flex: 1,
    paddingBottom: spacing.xl,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  mockMenuSectionHeader: {
    backgroundColor: '#fff3db',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 8,
  },
  mockMenuSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  mockMenuProductCard: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#f2f2f2',
    backgroundColor: '#fff',
  },
  mockMenuProductImage: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
  },
  mockMenuProductInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  mockMenuProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
    lineHeight: 20,
  },
  mockMenuProductPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  mockMenuAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ea8025',
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

  // Points pill
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  pointsPillIcon: {
    fontSize: 16,
  },
  pointsPillText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },

  // Quick Actions
  quickActionsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
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

  // Section
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // Horizontal list
  horizontalList: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },

  // Product Card
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  productImageWrap: {
    position: 'relative',
  },
  productImage: {
    width: PRODUCT_CARD_WIDTH,
    height: 120,
    backgroundColor: colors.cream,
  },
  productImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    gap: 4,
  },
  badgeHot: {
    backgroundColor: '#ef4444',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeNew: {
    backgroundColor: '#0ea5e9',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  productOldPrice: {
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
    marginTop: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },

  // Voucher Card
  voucherCard: {
    width: 180,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  voucherBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  voucherBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  voucherDividerLine: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },
  voucherContent: {
    padding: spacing.md,
    gap: 4,
  },
  voucherCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  voucherCode: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  voucherName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  voucherDate: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },

  // Branch Card
  branchCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  branchImage: {
    width: 90,
    height: 90,
    backgroundColor: colors.cream,
  },
  branchImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchInfo: {
    flex: 1,
    padding: spacing.md,
    gap: 5,
  },
  branchName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  branchAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  branchHours: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },

  // News Card
  newsCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  newsImage: {
    width: 100,
    height: 100,
    backgroundColor: colors.cream,
  },
  newsImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsInfo: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  newsCategoryBadge: {
    backgroundColor: '#fff4ec',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  newsCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  newsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  newsDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  newsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  newsMetaText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  newsMetaDot: {
    color: colors.muted,
    fontSize: 10,
  },

  // Footer
  footerBrand: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: 4,
  },
  footerBrandText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
  },
  footerBrandSub: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },

  // AI Recs
  aiRecsContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#efe8df',
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
  },
  aiRecsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  aiRecsSubLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#f97316', // orange-500
    letterSpacing: 1,
    marginBottom: 4,
  },
  aiRecsTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1f2937', // gray-800
    marginBottom: 4,
  },
  aiRecsDesc: {
    fontSize: 12,
    color: '#4b5563', // gray-600
    marginBottom: 6,
  },
  aiRecsSyncLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369a1', // sky-700
    letterSpacing: 0.8,
  },
  aiRecsBadge: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fed7aa', // orange-200
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  aiRecsBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ea580c', // orange-600
  },
  aiRecsListContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  aiRecsCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  aiRecsImageWrap: {
    position: 'relative',
  },
  aiRecsImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.cream,
  },
  aiRecsLikeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  aiRecsInfo: {
    padding: spacing.md,
  },
  aiRecsCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  aiRecsName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 6,
  },
  aiRecsPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ea580c',
    marginBottom: 12,
  },
  aiRecsActions: {
    flexDirection: 'row',
    gap: 8,
  },
  aiRecsBtnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 6,
    alignItems: 'center',
  },
  aiRecsBtnOutlineText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  aiRecsBtnSolid: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 6,
    alignItems: 'center',
  },
  aiRecsBtnSolidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
})