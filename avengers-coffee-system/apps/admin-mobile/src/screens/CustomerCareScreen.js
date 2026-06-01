import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatDateTime } from '../lib/adminData'

const ORANGE = '#f26b1d'
const TEAL = '#0ea5e9'

const STAR_LABELS = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc']

function ReplyModal({ visible, review, onClose, onSubmit, loading }) {
  const [text, setText] = useState(review?.phan_hoi_quan_ly || '')

  useEffect(() => {
    if (visible) setText(review?.phan_hoi_quan_ly || '')
  }, [visible, review])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>Phản hồi đánh giá</Text>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={modalStyles.body}>
          {/* Review preview */}
          {review ? (
            <View style={modalStyles.reviewPreview}>
              <View style={modalStyles.starsRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name="star"
                    size={16}
                    color={i < (review.diem_danh_gia || review.so_sao || 0) ? '#f59e0b' : '#374151'}
                  />
                ))}
                <Text style={modalStyles.starLabel}>
                  {STAR_LABELS[(review.diem_danh_gia || review.so_sao || 1) - 1] || ''}
                </Text>
              </View>
              <Text style={modalStyles.reviewContent}>{review.noi_dung || review.binh_luan || 'Không có nội dung'}</Text>
              <Text style={modalStyles.reviewMeta}>
                {review.ten_khach_hang || review.nguoi_danh_gia || 'Khách hàng'} · {formatDateTime(review.ngay_tao || review.created_at)}
              </Text>
            </View>
          ) : null}

          <Text style={modalStyles.fieldLabel}>Nội dung phản hồi *</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Nhập phản hồi của cửa hàng..."
            placeholderTextColor="#4b5563"
            multiline
            numberOfLines={5}
            style={[modalStyles.input, { height: 120, textAlignVertical: 'top', paddingTop: 10 }]}
          />
          <Pressable
            disabled={loading || !text.trim()}
            onPress={() => onSubmit(review?.id || review?.ma_danh_gia, text.trim())}
            style={modalStyles.submitBtn}
          >
            <LinearGradient colors={[TEAL, '#0284c7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={modalStyles.submitGrad}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={modalStyles.submitText}>Gửi phản hồi</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function CustomerCareScreen() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterRating, setFilterRating] = useState(0) // 0 = all
  const [filterReplied, setFilterReplied] = useState('ALL') // ALL, REPLIED, PENDING
  const [selectedReview, setSelectedReview] = useState(null)
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyingId, setReplyingId] = useState('')

  // GET /manager/reviews?limit=200
  const loadReviews = useCallback(async () => {
    try {
      const response = await apiClient.get('/manager/reviews?limit=200')
      const arr = response?.items || (Array.isArray(response) ? response : [])
      setReviews(arr)
      setError('')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được đánh giá')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  // PATCH /manager/reviews/:id/reply
  const handleReply = async (reviewId, phanHoi) => {
    setReplyLoading(true)
    setReplyingId(String(reviewId))
    try {
      await apiClient.patch(`/manager/reviews/${reviewId}/reply`, {
        phan_hoi: String(phanHoi || '').trim(),
      })
      setSelectedReview(null)
      await loadReviews()
      Alert.alert('Thành công', 'Đã gửi phản hồi thành công!')
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Gửi phản hồi thất bại')
    } finally {
      setReplyLoading(false)
      setReplyingId('')
    }
  }

  // DELETE /manager/reviews/:id/reply
  const handleDeleteReply = (review) => {
    Alert.alert('Xóa phản hồi', 'Bạn có chắc muốn xóa phản hồi này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/manager/reviews/${review.id || review.ma_danh_gia}/reply`)
            await loadReviews()
          } catch (err) {
            Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Xóa thất bại')
          }
        },
      },
    ])
  }

  // Filter
  const filtered = reviews.filter((r) => {
    if (filterRating > 0 && (r.diem_danh_gia || r.so_sao || 0) !== filterRating) return false
    if (filterReplied === 'REPLIED' && !r.phan_hoi_quan_ly) return false
    if (filterReplied === 'PENDING' && r.phan_hoi_quan_ly) return false
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      const content = String(r.noi_dung || r.binh_luan || '').toLowerCase()
      const customer = String(r.ten_khach_hang || r.nguoi_danh_gia || '').toLowerCase()
      if (!content.includes(kw) && !customer.includes(kw)) return false
    }
    return true
  })

  const pendingCount = reviews.filter((r) => !r.phan_hoi_quan_ly).length

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#ffffff', '#f1f5f9']} style={styles.header}>
        <Text style={styles.headerTitle}>CSKH - Phản hồi đánh giá</Text>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Text style={styles.statText}>{reviews.length} đánh giá</Text>
          </View>
          {pendingCount > 0 ? (
            <View style={[styles.statPill, { backgroundColor: '#f59e0b15' }]}>
              <Text style={[styles.statText, { color: '#d97706' }]}>{pendingCount} chưa phản hồi</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm nội dung, khách hàng..."
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
        />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#64748b" /></Pressable> : null}
      </View>

      {/* Rating filter */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[0, 5, 4, 3, 2, 1]}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setFilterRating(item)}
              style={[styles.starChip, filterRating === item && styles.starChipActive]}
            >
              {item === 0 ? (
                <Text style={[styles.starChipText, filterRating === 0 && { color: ORANGE }]}>Tất cả</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="star" size={12} color={filterRating === item ? '#f59e0b' : '#6b7280'} />
                  <Text style={[styles.starChipText, filterRating === item && { color: '#f59e0b' }]}>{item}</Text>
                </View>
              )}
            </Pressable>
          )}
        />
      </View>

      {/* Replied filter */}
      <View style={styles.repliedFilter}>
        {['ALL', 'PENDING', 'REPLIED'].map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilterReplied(f)}
            style={[styles.repliedChip, filterReplied === f && styles.repliedChipActive]}
          >
            <Text style={[styles.repliedText, filterReplied === f && styles.repliedTextActive]}>
              {f === 'ALL' ? 'Tất cả' : f === 'PENDING' ? '⏳ Chưa phản hồi' : '✅ Đã phản hồi'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id || item.ma_danh_gia)}
        renderItem={({ item }) => {
          const stars = item.diem_danh_gia || item.so_sao || 0
          const hasReply = Boolean(item.phan_hoi_quan_ly)
          return (
            <View style={styles.reviewCard}>
              <View style={styles.reviewTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{item.ten_khach_hang || item.nguoi_danh_gia || 'Khách hàng'}</Text>
                  <View style={styles.starsRow}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Ionicons key={i} name="star" size={13} color={i < stars ? '#f59e0b' : '#374151'} />
                    ))}
                    <Text style={styles.starLabel}>{STAR_LABELS[stars - 1] || ''}</Text>
                  </View>
                </View>
                <Text style={styles.reviewDate}>{formatDateTime(item.ngay_tao || item.created_at)}</Text>
              </View>

              <Text style={styles.reviewContent} numberOfLines={3}>{item.noi_dung || item.binh_luan || 'Không có nội dung'}</Text>

              {/* Reply preview */}
              {hasReply ? (
                <View style={styles.replyBox}>
                  <View style={styles.replyHeader}>
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color={TEAL} />
                    <Text style={styles.replyTitle}>Phản hồi cửa hàng</Text>
                    <Pressable onPress={() => { setSelectedReview(item) }} style={styles.editReplyBtn}>
                      <Ionicons name="pencil-outline" size={12} color="#6b7280" />
                    </Pressable>
                    <Pressable onPress={() => handleDeleteReply(item)} style={styles.deleteReplyBtn}>
                      <Ionicons name="trash-outline" size={12} color="#ef4444" />
                    </Pressable>
                  </View>
                  <Text style={styles.replyContent} numberOfLines={2}>{item.phan_hoi_quan_ly}</Text>
                </View>
              ) : null}

              {/* Action buttons */}
              <View style={styles.reviewActions}>
                {hasReply ? (
                  <View style={styles.repliedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                    <Text style={styles.repliedBadgeText}>Đã phản hồi</Text>
                  </View>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Ionicons name="time-outline" size={12} color="#f59e0b" />
                    <Text style={styles.pendingBadgeText}>Chưa phản hồi</Text>
                  </View>
                )}
                <Pressable
                  onPress={() => setSelectedReview(item)}
                  style={styles.replyBtn}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={TEAL} />
                  <Text style={styles.replyBtnText}>{hasReply ? 'Sửa phản hồi' : 'Phản hồi'}</Text>
                </Pressable>
              </View>
            </View>
          )
        }}
        contentContainerStyle={styles.listPad}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={ORANGE} size="large" /></View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color="#2a2a2e" />
              <Text style={styles.emptyText}>Không có đánh giá nào</Text>
            </View>
          )
        }
        onRefresh={() => { setRefreshing(true); loadReviews() }}
        refreshing={refreshing}
      />

      <ReplyModal
        visible={Boolean(selectedReview)}
        review={selectedReview}
        onClose={() => setSelectedReview(null)}
        onSubmit={handleReply}
        loading={replyLoading}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingTop: 52, paddingLeft: 60, paddingRight: 16, paddingBottom: 14, gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  headerStats: { flexDirection: 'row', gap: 8 },
  statPill: { backgroundColor: TEAL + '15', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statText: { fontSize: 11, fontWeight: '700', color: TEAL },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    marginBottom: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 14, fontWeight: '500' },
  filterRow: { paddingVertical: 8 },
  starChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  starChipActive: { backgroundColor: ORANGE + '15', borderColor: ORANGE },
  starChipText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  repliedFilter: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  repliedChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  repliedChipActive: { backgroundColor: TEAL + '15', borderColor: TEAL },
  repliedText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  repliedTextActive: { color: TEAL },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    backgroundColor: '#ef444415',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ef444430',
  },
  errorText: { flex: 1, fontSize: 12, color: '#ef4444' },
  listPad: { padding: 12, gap: 10, paddingBottom: 24 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: '#64748b' },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customerName: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  starLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginLeft: 4 },
  reviewDate: { fontSize: 10, color: '#475569' },
  reviewContent: { fontSize: 13, color: '#334155', lineHeight: 18 },
  replyBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: TEAL,
  },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: TEAL },
  editReplyBtn: { padding: 3 },
  deleteReplyBtn: { padding: 3 },
  replyContent: { fontSize: 12, color: '#475569', fontStyle: 'italic', lineHeight: 17 },
  reviewActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  repliedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repliedBadgeText: { fontSize: 11, color: '#16a34a', fontWeight: '700' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pendingBadgeText: { fontSize: 11, color: '#d97706', fontWeight: '700' },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: TEAL + '15',
    borderWidth: 1,
    borderColor: TEAL + '40',
  },
  replyBtnText: { fontSize: 12, fontWeight: '800', color: TEAL },
})

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 14, paddingBottom: 40 },
  reviewPreview: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  starLabel: { fontSize: 11, color: '#f59e0b', fontWeight: '700', marginLeft: 4 },
  reviewContent: { fontSize: 13, color: '#334155', lineHeight: 18 },
  reviewMeta: { fontSize: 11, color: '#64748b' },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { fontSize: 15, fontWeight: '900', color: '#fff' },
})
