import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { formatDateTime } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'
import { useAdmin } from '../context/AdminContext'

export function NewsScreen() {
  const { sessionUsername } = useAdmin()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Editor Modal State
  const [editorVisible, setEditorVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    id: null,
    title: '',
    category: 'BLOG',
    description: '',
    content: '',
    author_name: sessionUsername || 'Nhân viên',
    is_published: true,
  })

  const loadData = useCallback(async () => {
    try {
      // web-admin uses /news/admin/list?limit=200
      const res = await apiClient.get('/news/admin/list?limit=100')
      setArticles(res.items || [])
      setError('')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể tải tin tức')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const openCreate = () => {
    setFormData({
      id: null,
      title: '',
      category: 'BLOG',
      description: '',
      content: '',
      author_name: sessionUsername || 'Nhân viên',
      is_published: true,
    })
    setEditorVisible(true)
  }

  const openEdit = (item) => {
    setFormData({
      id: item.id || item._id,
      title: item.title || '',
      category: item.category || 'BLOG',
      description: item.description || '',
      content: item.content || '',
      author_name: item.author_name || item.author || '',
      is_published: item.is_published !== undefined ? item.is_published : true,
    })
    setEditorVisible(true)
  }

  const handleDelete = (id) => {
    Alert.alert('Xác nhận xóa', 'Bạn có chắc muốn xóa bài viết này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/news/admin/${id}`)
            await loadData()
          } catch (err) {
            Alert.alert('Lỗi', err?.message || 'Không thể xóa')
          }
        },
      },
    ])
  }

  const handleSave = async () => {
    if (!formData.title) return Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề')
    setSaving(true)
    try {
      const payload = new FormData()
      payload.append('title', formData.title)
      payload.append('category', formData.category || 'BLOG')
      payload.append('description', formData.description || '')
      payload.append('content', formData.content || '')
      payload.append('author_name', formData.author_name || 'Nhân viên')
      payload.append('is_published', String(Boolean(formData.is_published)))

      if (formData.id) {
        await apiClient.put(`/news/admin/${formData.id}`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        await apiClient.post('/news/admin/create', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setEditorVisible(false)
      await loadData()
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Không thể lưu bài viết')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={[styles.headerTitleContainer, { paddingLeft: 68 }]}>
        <Text style={styles.pageTitle} numberOfLines={1}>Tin tức</Text>
        <Text style={styles.pageSubtitle} numberOfLines={1}>Quản lý bài viết, sự kiện</Text>
      </View>

      <View style={styles.toolbar}>
        <Pressable onPress={openCreate} style={styles.createBtn}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.createBtnText}>Tạo bài viết mới</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={articles}
        keyExtractor={(item, index) => item.id || item._id || String(index)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, shadows.sm]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: item.is_published ? colors.successBg : colors.border }]}>
                <Text style={[styles.badgeText, { color: item.is_published ? colors.success : colors.textSecondary }]}>
                  {item.is_published ? 'Published' : 'Draft'}
                </Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.metaText}>{item.category} • {item.author_name || item.author}</Text>
              <Text style={styles.metaText}>{formatDateTime(item.created_at || item.createdAt)}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => openEdit(item)} style={[styles.actionBtn, { backgroundColor: colors.infoBg }]}>
                <Text style={[styles.actionBtnText, { color: colors.info }]}>Sửa</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id || item._id)} style={[styles.actionBtn, { backgroundColor: colors.dangerBg }]}>
                <Text style={[styles.actionBtnText, { color: colors.danger }]}>Xóa</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <Text style={{ textAlign: 'center', marginTop: 40, color: colors.muted }}>Không có bài viết nào.</Text>
          )
        }
        onRefresh={() => { setRefreshing(true); loadData() }}
        refreshing={refreshing}
      />

      <Modal visible={editorVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{formData.id ? 'Sửa bài viết' : 'Tạo bài viết'}</Text>
            <Pressable onPress={() => setEditorVisible(false)}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.label}>Tiêu đề</Text>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(t) => setFormData(prev => ({ ...prev, title: t }))}
              placeholder="Nhập tiêu đề..."
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Danh mục</Text>
                <TextInput
                  style={styles.input}
                  value={formData.category}
                  onChangeText={(t) => setFormData(prev => ({ ...prev, category: t }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tác giả</Text>
                <TextInput
                  style={styles.input}
                  value={formData.author_name}
                  onChangeText={(t) => setFormData(prev => ({ ...prev, author_name: t }))}
                />
              </View>
            </View>

            <Text style={styles.label}>Mô tả ngắn</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={formData.description}
              onChangeText={(t) => setFormData(prev => ({ ...prev, description: t }))}
              multiline
            />

            <Text style={styles.label}>Nội dung chi tiết</Text>
            <TextInput
              style={[styles.input, { height: 160, textAlignVertical: 'top' }]}
              value={formData.content}
              onChangeText={(t) => setFormData(prev => ({ ...prev, content: t }))}
              multiline
            />

            <Pressable onPress={handleSave} style={styles.saveBtn} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Lưu bài viết</Text>}
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerTitleContainer: { marginBottom: spacing.sm, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  toolbar: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  errorBox: { marginHorizontal: spacing.lg, backgroundColor: colors.dangerBg, padding: 12, borderRadius: radius.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metaText: { fontSize: 12, color: colors.muted },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 12 },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm },
  actionBtnText: { fontSize: 12, fontWeight: 'bold' },
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  modalBody: { padding: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
})
