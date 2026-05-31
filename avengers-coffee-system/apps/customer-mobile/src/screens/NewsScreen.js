import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Image,
  ScrollView,
  Modal,
  RefreshControl,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../lib/apiClient'
import { formatDateTime, normalizeNewsArticle, safeArray } from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

const CATEGORIES = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Tin tức', label: 'Tin tức' },
  { value: 'Sự kiện', label: 'Sự kiện' },
  { value: 'Khuyến mãi', label: 'Khuyến mãi' },
  { value: 'Câu chuyện', label: 'Câu chuyện' },
]

function ArticleDetailModal({ article, visible, onClose }) {
  if (!article) return null
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        {/* Header */}
        <LinearGradient colors={['#1a0a02', '#3d1a08']} style={detailStyles.header}>
          <Pressable onPress={onClose} style={detailStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          {article.category ? (
            <View style={detailStyles.categoryBadge}>
              <Text style={detailStyles.categoryBadgeText}>{article.category}</Text>
            </View>
          ) : null}
        </LinearGradient>

        <ScrollView style={detailStyles.content} showsVerticalScrollIndicator={false}>
          {/* Cover Image */}
          {article.image_url ? (
            <Image source={{ uri: article.image_url }} style={detailStyles.image} resizeMode="cover" />
          ) : null}

          <View style={detailStyles.body}>
            {/* Title */}
            <Text style={detailStyles.title}>{article.title}</Text>

            {/* Meta */}
            <View style={detailStyles.meta}>
              <Ionicons name="time-outline" size={13} color={colors.muted} />
              <Text style={detailStyles.metaText}>{formatDateTime(article.created_at)}</Text>
              <Text style={detailStyles.metaDot}>·</Text>
              <Ionicons name="eye-outline" size={13} color={colors.muted} />
              <Text style={detailStyles.metaText}>{article.views} lượt xem</Text>
            </View>

            {/* Description */}
            {article.description ? (
              <Text style={detailStyles.description}>{article.description}</Text>
            ) : null}

            {/* Divider */}
            <View style={detailStyles.divider} />

            {/* Content */}
            {article.content ? (
              <Text style={detailStyles.contentText}>{article.content}</Text>
            ) : (
              <Text style={detailStyles.noContent}>Không có nội dung chi tiết.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

function FeaturedNewsCard({ article, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(article)}
      style={({ pressed }) => [styles.featuredCard, shadows.card, pressed && { opacity: 0.9 }]}
    >
      {article.image_url ? (
        <Image source={{ uri: article.image_url }} style={styles.featuredImage} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#f26b1d', '#3d1a08']} style={styles.featuredImage}>
          <Ionicons name="newspaper-outline" size={48} color="#fff" />
        </LinearGradient>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.featuredOverlay}
      >
        {article.category ? (
          <View style={styles.featuredCategoryBadge}>
            <Text style={styles.featuredCategoryText}>{article.category}</Text>
          </View>
        ) : null}
        <Text style={styles.featuredTitle} numberOfLines={3}>{article.title}</Text>
        <View style={styles.featuredMeta}>
          <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.75)" />
          <Text style={styles.featuredMetaText}>{article.views} lượt xem</Text>
          <Text style={styles.featuredMetaDot}>·</Text>
          <Text style={styles.featuredMetaText}>{formatDateTime(article.created_at)}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

function NewsListCard({ article, onPress }) {
  return (
    <Pressable
      onPress={() => onPress(article)}
      style={({ pressed }) => [styles.newsCard, shadows.xs, pressed && { opacity: 0.92 }]}
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
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{article.category}</Text>
          </View>
        ) : null}
        <Text style={styles.newsTitle} numberOfLines={2}>{article.title}</Text>
        {article.description ? (
          <Text style={styles.newsDesc} numberOfLines={2}>{article.description}</Text>
        ) : null}
        <View style={styles.newsMeta}>
          <Ionicons name="eye-outline" size={11} color={colors.muted} />
          <Text style={styles.newsMetaText}>{article.views} lượt xem</Text>
          <Text style={styles.newsMetaDot}>·</Text>
          <Text style={styles.newsMetaText}>{formatDateTime(article.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  )
}

export function NewsScreen({ route }) {
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedArticle, setSelectedArticle] = useState(route?.params?.article || null)
  const [isDetailOpen, setIsDetailOpen] = useState(Boolean(route?.params?.article))

  const newsQuery = useQuery({
    queryKey: ['customer', 'news', categoryFilter],
    queryFn: async () => {
      const params = categoryFilter !== 'all' ? `?category=${encodeURIComponent(categoryFilter)}` : ''
      const response = await apiClient.get(`/news${params}`)
      return safeArray(response?.items || response).map(normalizeNewsArticle)
    },
    staleTime: 60 * 1000,
  })

  const articles = newsQuery.data || []
  const featuredArticle = articles[0] || null
  const restArticles = articles.slice(1)

  const handlePress = (article) => {
    setSelectedArticle(article)
    setIsDetailOpen(true)
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.header}>
        <Text style={styles.headerTitle}>Tin tức & Câu chuyện</Text>
        <Text style={styles.headerSubtitle}>{articles.length} bài viết</Text>
      </LinearGradient>

      {/* Category Filter */}
      <View style={styles.categoryBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setCategoryFilter(item.value)}
              style={[styles.categoryChip, categoryFilter === item.value && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, categoryFilter === item.value && styles.categoryChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Loading */}
      {newsQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải bài viết...</Text>
        </View>
      ) : null}

      {/* Empty */}
      {!newsQuery.isLoading && articles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="newspaper-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>Chưa có bài viết</Text>
          <Text style={styles.emptyText}>Hãy quay lại sau để đọc những tin tức mới nhất.</Text>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={newsQuery.isFetching && !newsQuery.isLoading}
            onRefresh={() => newsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Featured Article */}
        {featuredArticle ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📌 Nổi bật</Text>
            <FeaturedNewsCard article={featuredArticle} onPress={handlePress} />
          </View>
        ) : null}

        {/* Rest Articles */}
        {restArticles.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📰 Tất cả bài viết</Text>
            {restArticles.map((article) => (
              <NewsListCard key={article.id} article={article} onPress={handlePress} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Article Detail Modal */}
      <ArticleDetailModal
        article={selectedArticle}
        visible={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false)
          setSelectedArticle(null)
        }}
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
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    fontWeight: '500',
  },
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
  categoryChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
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
  content: {
    paddingBottom: spacing.xxl,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },

  // Featured Card
  featuredCard: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    position: 'relative',
    height: 280,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: 8,
  },
  featuredCategoryBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  featuredCategoryText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 26,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  featuredMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  featuredMetaDot: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },

  // News List Card
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
    width: 110,
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
  categoryBadge: {
    backgroundColor: '#fff4ec',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
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
})

// Detail Modal Styles
const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: 260,
    backgroundColor: colors.cream,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 34,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  metaDot: {
    color: colors.muted,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 26,
    fontStyle: 'italic',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  contentText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 26,
  },
  noContent: {
    fontSize: 14,
    color: colors.muted,
    fontStyle: 'italic',
  },
})
