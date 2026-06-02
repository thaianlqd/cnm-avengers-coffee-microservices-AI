import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getUserDisplayName,
  getUserId,
  normalizeBranch,
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

function HeroSection({ user, loyalty }) {
  const tier = loyalty?.hang_thanh_vien?.ma_hang || user?.membership_tier || 'MEMBER'
  const config = MEMBERSHIP_CONFIG[tier] || MEMBERSHIP_CONFIG.MEMBER
  const diemLoyalty = Number(loyalty?.diem ?? user?.loyalty_points ?? 0)
  const diemCanLen = loyalty?.hang_thanh_vien?.diem_can_len_hang ?? null
  const diemBatDau = loyalty?.hang_thanh_vien?.diem_bat_dau_hang ?? 0
  const phanTram = diemCanLen != null
    ? Math.min(100, Math.round(((diemLoyalty - diemBatDau) / Math.max(diemCanLen - diemBatDau, 1)) * 100))
    : 100

  return (
    <LinearGradient
      colors={['#1a0a02', '#3d1a08', '#f26b1d']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      {/* Greeting */}
      <View style={styles.heroTop}>
        <View style={styles.heroAvatarWrap}>
          <LinearGradient colors={['#f26b1d', '#d4560e']} style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {String(getUserDisplayName(user))[0]?.toUpperCase() || '☕'}
            </Text>
          </LinearGradient>
        </View>
        <View style={styles.heroGreeting}>
          <Text style={styles.heroHello}>Xin chào,</Text>
          <Text style={styles.heroName} numberOfLines={1}>{getUserDisplayName(user)}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>{config.icon} {config.label}</Text>
        </View>
      </View>

      {/* Points card */}
      <View style={styles.pointsCard}>
        <View style={styles.pointsRow}>
          <View style={styles.pointsLeft}>
            <Text style={styles.pointsValue}>{diemLoyalty.toLocaleString('vi-VN')}</Text>
            <Text style={styles.pointsLabel}>Điểm tích lũy</Text>
          </View>
          <View style={styles.pointsDivider} />
          <View style={styles.pointsRight}>
            <Text style={styles.rateValue}>1 điểm</Text>
            <Text style={styles.rateLabel}>= 1.000đ giảm giá</Text>
          </View>
        </View>

        {diemCanLen != null && (
          <View style={styles.progressWrap}>
            <View style={styles.progressInfo}>
              <Text style={styles.progressText}>{diemLoyalty.toLocaleString('vi-VN')} / {diemCanLen.toLocaleString('vi-VN')} điểm</Text>
              <Text style={styles.progressText}>Lên hạng {config.nextLabel}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${phanTram}%` }]} />
            </View>
          </View>
        )}
      </View>
    </LinearGradient>
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

export function HomeScreen({ navigation }) {
  const { user } = useUser()
  const userId = getUserId(user)

  const loyaltyQuery = useQuery({
    queryKey: ['customer', 'loyalty', userId],
    queryFn: async () => apiClient.get(`/users/${userId}/loyalty`),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  })

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Section */}
      <HeroSection user={user} loyalty={loyalty} />

      {/* Quick Actions */}
      <View style={styles.quickActionsCard}>
        <Pressable
          onPress={() => navigation.navigate('Menu')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#f26b1d', '#d4560e']} style={styles.quickActionIcon}>
            <Ionicons name="restaurant-outline" size={22} color="#fff" />
          </LinearGradient>
          <Text style={styles.quickActionLabel}>Menu</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Cart')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.quickActionIcon}>
            <Ionicons name="bag-outline" size={22} color="#fff" />
          </LinearGradient>
          <Text style={styles.quickActionLabel}>Giỏ hàng</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Orders')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#0ea5e9', '#0284c7']} style={styles.quickActionIcon}>
            <Ionicons name="receipt-outline" size={22} color="#fff" />
          </LinearGradient>
          <Text style={styles.quickActionLabel}>Đơn hàng</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Vouchers')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#a855f7', '#9333ea']} style={styles.quickActionIcon}>
            <Ionicons name="gift-outline" size={22} color="#fff" />
          </LinearGradient>
          <Text style={styles.quickActionLabel}>Voucher</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Chat')}
          style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#ec4899', '#db2777']} style={styles.quickActionIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
          </LinearGradient>
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
    </ScrollView>
  )
}

const PRODUCT_CARD_WIDTH = 160

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxl,
  },

  // Hero
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.xl,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  heroAvatarWrap: {},
  heroAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroAvatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  heroGreeting: {
    flex: 1,
  },
  heroHello: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  heroName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  pointsCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsLeft: {
    flex: 1,
  },
  pointsValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  pointsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  pointsDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: spacing.md,
  },
  pointsRight: {},
  rateValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  rateLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  progressWrap: {
    marginTop: spacing.md,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.full,
  },

  // Quick Actions
  quickActionsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    marginHorizontal: spacing.md,
    marginTop: -20,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '800',
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
    fontWeight: '900',
    color: colors.text,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '900',
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
    fontWeight: '700',
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
    fontWeight: '900',
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
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  newsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 18,
  },
  newsDesc: {
    fontSize: 11,
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
