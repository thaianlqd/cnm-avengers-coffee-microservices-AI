import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { colors, radius, shadows, spacing } from '../theme'
import { safeArray } from '../lib/adminData'

const TEAL = '#0ea5e9'

export function AdminCategoriesScreen() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [keyword, setKeyword] = useState('')

  // Form
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    label: '',
    icon: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/menu/categories`)
      const items = safeArray(res)
      items.sort((a, b) => Number(b?.id || b?.code || 0) - Number(a?.id || a?.code || 0))
      setCategories(items)
    } catch (err) {
      console.log('Error loading categories', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredCategories = useMemo(() => {
    return categories.filter(c => {
      if (keyword) {
        const q = keyword.toLowerCase()
        const l = String(c.label || '').toLowerCase()
        if (!l.includes(q)) return false
      }
      return true
    })
  }, [categories, keyword])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      label: '',
      icon: '',
    })
    setModalVisible(true)
  }

  const openEdit = (c) => {
    setEditingId(c.id || c.code)
    setForm({
      label: c.label || '',
      icon: c.icon || '',
    })
    setModalVisible(true)
  }

  const handleDelete = (c) => {
    Alert.alert('Xác nhận', `Bạn muốn xóa danh mục ${c.label}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try {
          const catId = c.id || c.code
          await apiClient.delete(`/menu/categories/${catId}`)
          Alert.alert('Thành công', 'Đã xóa danh mục')
          loadData()
        } catch (e) {
          Alert.alert('Lỗi', 'Không thể xóa danh mục (Có thể đang chứa món ăn)')
        }
      }}
    ])
  }

  const handleSave = async () => {
    if (!form.label) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên danh mục')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        // Cập nhật
        await apiClient.patch(`/menu/categories/${editingId}`, form)
        Alert.alert('Thành công', 'Đã cập nhật danh mục')
      } else {
        // Tạo mới
        await apiClient.post(`/menu/categories`, form)
        Alert.alert('Thành công', 'Đã tạo danh mục mới')
      }
      setModalVisible(false)
      loadData()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu danh mục')
    } finally {
      setSaving(false)
    }
  }

  if (loading && categories.length === 0) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.pageTitle} numberOfLines={1}>Danh mục</Text>
          <Text style={styles.pageSubtitle} numberOfLines={1}>Phân loại thực đơn</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Tạo mới</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên danh mục..."
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredCategories.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Không tìm thấy danh mục phù hợp</Text>
          </View>
        ) : (
          filteredCategories.map(c => (
            <View key={c.id || c.code} style={styles.userCard}>
              <View style={styles.userCardHeader}>
                <View style={styles.userInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(c.label || 'D')[0].toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.userName}>{c.label}</Text>
                    <Text style={styles.userUsername}>Mã DM: {c.id || c.code}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(c)}>
                    <Ionicons name="pencil" size={18} color={TEAL} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(c)}>
                    <Ionicons name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Cập nhật danh mục' : 'Thêm danh mục'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tên danh mục</Text>
                <TextInput style={styles.input} value={form.label} onChangeText={(t) => setForm({...form, label: t})} placeholder="VD: Cà phê" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Icon URL (Tùy chọn)</Text>
                <TextInput style={styles.input} value={form.icon} onChangeText={(t) => setForm({...form, icon: t})} placeholder="https://..." />
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Lưu danh mục</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    marginBottom: spacing.md,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  filterContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#0f172a' },
  listContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 100 },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...shadows.sm,
  },
  userCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TEAL + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: TEAL },
  userName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  userUsername: { fontSize: 13, color: '#64748b' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#94a3b8', marginTop: 12, fontSize: 15 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  closeBtn: { padding: 4 },
  formContent: { padding: spacing.lg },
  formGroup: { marginBottom: spacing.md },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
    gap: 12,
  },
  cancelBtn: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#475569', fontWeight: '600', fontSize: 15 },
  saveBtn: { flex: 2, height: 44, borderRadius: radius.md, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
