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
  Switch,
  Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { radius, shadows, spacing } from '../theme'
import { safeArray } from '../lib/adminData'

const TEAL = '#0ea5e9'

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('vi-VN') + ' đ'
}

function getImageUrl(raw) {
  if (!raw) return null
  if (raw.startsWith('http')) return raw
  // Fallback if relative
  return null // or append a known base url if we had one
}

export function AdminMenuScreen() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [keyword, setKeyword] = useState('')

  // Form
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const DEFAULT_FORM = {
    name: '',
    category_code: '',
    price: '0',
    original_price: '0',
    image: '',
    description: '',
    dang_ban: true,
    la_hot: false,
    la_moi: false,
  }

  const [form, setForm] = useState(DEFAULT_FORM)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [resItems, resCats] = await Promise.all([
        apiClient.get('/menu/items?sort=price_desc'),
        apiClient.get('/menu/categories')
      ])
      setItems(safeArray(resItems?.items || resItems))
      
      const cats = safeArray(resCats)
      setCategories(cats)
      if (cats.length > 0 && !form.category_code) {
        setForm(prev => ({ ...prev, category_code: cats[0].id || cats[0].code }))
      }
    } catch (err) {
      console.log('Error loading menu', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredItems = useMemo(() => {
    return items.filter(c => {
      if (keyword) {
        const q = keyword.toLowerCase()
        const n = String(c.name || '').toLowerCase()
        const desc = String(c.description || '').toLowerCase()
        if (!n.includes(q) && !desc.includes(q)) return false
      }
      return true
    })
  }, [items, keyword])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ...DEFAULT_FORM,
      category_code: categories.length > 0 ? (categories[0].id || categories[0].code) : ''
    })
    setModalVisible(true)
  }

  const openEdit = (c) => {
    setEditingId(c.id || c.product_id)
    setForm({
      name: c.name || '',
      category_code: c.category_code || '',
      price: String(c.price || 0),
      original_price: String(c.original_price || 0),
      image: c.image || '',
      description: c.description || '',
      dang_ban: c.dang_ban ?? true,
      la_hot: c.la_hot ?? false,
      la_moi: c.la_moi ?? false,
    })
    setModalVisible(true)
  }

  const handleDelete = (c) => {
    Alert.alert('Xác nhận', `Bạn muốn xóa món ${c.name}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try {
          const itemId = c.id || c.product_id
          await apiClient.delete(`/menu/items/${itemId}`)
          Alert.alert('Thành công', 'Đã xóa món ăn')
          loadData()
        } catch (e) {
          Alert.alert('Lỗi', 'Không thể xóa món ăn')
        }
      }}
    ])
  }

  const handleSave = async () => {
    if (!form.name || !form.category_code) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên món và chọn danh mục')
      return
    }

    const payload = {
      ...form,
      price: Number(form.price),
      original_price: Number(form.original_price),
    }

    setSaving(true)
    try {
      if (editingId) {
        await apiClient.patch(`/menu/items/${editingId}`, payload)
        Alert.alert('Thành công', 'Đã cập nhật món ăn')
      } else {
        await apiClient.post(`/menu/items`, payload)
        Alert.alert('Thành công', 'Đã thêm món mới')
      }
      setModalVisible(false)
      loadData()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu món ăn')
    } finally {
      setSaving(false)
    }
  }

  if (loading && items.length === 0) {
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
          <Text style={styles.pageTitle} numberOfLines={1}>Thực đơn</Text>
          <Text style={styles.pageSubtitle} numberOfLines={1}>Quản lý món ăn, đồ uống</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Thêm món</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên món, danh mục..."
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Không tìm thấy món ăn phù hợp</Text>
          </View>
        ) : (
          filteredItems.map(c => {
            const catName = categories.find(cat => (cat.id || cat.code) === c.category_code)?.label || c.category_code
            return (
              <View key={c.id || c.product_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.infoRow}>
                    {getImageUrl(c.image) ? (
                      <Image source={{ uri: getImageUrl(c.image) }} style={styles.imageThumb} />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="fast-food" size={24} color="#94a3b8" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{c.name}</Text>
                      <Text style={styles.itemCat}>{catName}</Text>
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
                
                <View style={styles.cardBody}>
                  <View style={styles.row}>
                    <Text style={styles.label}>Giá bán:</Text>
                    <Text style={styles.valuePrice}>{fmtMoney(c.price)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Trạng thái:</Text>
                    <Text style={styles.value}>{c.dang_ban ? 'Đang bán' : 'Ngừng bán'}</Text>
                  </View>
                  <View style={styles.tags}>
                    {c.la_hot && <View style={styles.tag}><Text style={styles.tagTextHot}>Món Hot</Text></View>}
                    {c.la_moi && <View style={styles.tag}><Text style={styles.tagTextNew}>Món Mới</Text></View>}
                    {!c.la_hot && !c.la_moi && <View style={styles.tagNormal}><Text style={styles.tagTextNormal}>Bình thường</Text></View>}
                  </View>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Cập nhật món ăn' : 'Thêm món mới'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tên món</Text>
                <TextInput style={styles.input} value={form.name} onChangeText={(t) => setForm({...form, name: t})} placeholder="VD: Cà phê sữa đá" />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Danh mục</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 10 }}>
                  {categories.map((cat) => {
                    const catId = cat.id || cat.code
                    const isActive = form.category_code === catId
                    return (
                      <TouchableOpacity 
                        key={catId} 
                        style={[styles.catBtn, isActive && styles.catBtnActive]}
                        onPress={() => setForm({...form, category_code: catId})}
                      >
                        <Text style={[styles.catBtnText, isActive && styles.catBtnTextActive]}>{cat.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Giá bán (đ)</Text>
                  <TextInput style={styles.input} value={form.price} onChangeText={(t) => setForm({...form, price: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Giá niêm yết (đ)</Text>
                  <TextInput style={styles.input} value={form.original_price} onChangeText={(t) => setForm({...form, original_price: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Mô tả</Text>
                <TextInput style={[styles.input, { height: 60 }]} value={form.description} onChangeText={(t) => setForm({...form, description: t})} placeholder="Mô tả ngắn gọn cho món..." multiline />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Đường dẫn ảnh (URL)</Text>
                <TextInput style={styles.input} value={form.image} onChangeText={(t) => setForm({...form, image: t})} placeholder="https://..." />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Trạng thái (Đang bán)</Text>
                <Switch value={form.dang_ban} onValueChange={(v) => setForm({...form, dang_ban: v})} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Gắn nhãn: Món Hot</Text>
                <Switch value={form.la_hot} onValueChange={(v) => setForm({...form, la_hot: v})} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Gắn nhãn: Món Mới</Text>
                <Switch value={form.la_moi} onValueChange={(v) => setForm({...form, la_moi: v})} />
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Lưu món</Text>}
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
  
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  imageThumb: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: '#f1f5f9' },
  imagePlaceholder: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  itemCat: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  
  actions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  cardBody: { gap: 6, backgroundColor: '#f8fafc', padding: 12, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 80, fontSize: 13, color: '#64748b' },
  value: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '500' },
  valuePrice: { flex: 1, fontSize: 14, color: '#ea580c', fontWeight: '700' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#fee2e2' },
  tagTextHot: { fontSize: 11, fontWeight: '700', color: '#dc2626' },
  tagTextNew: { fontSize: 11, fontWeight: '700', color: '#ea580c' },
  tagNormal: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#f1f5f9' },
  tagTextNormal: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#94a3b8', marginTop: 12, fontSize: 15 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
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
  formLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
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
  catBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8, borderWidth: 1, borderColor: 'transparent' },
  catBtnActive: { backgroundColor: '#e0f2fe', borderColor: '#38bdf8' },
  catBtnText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  catBtnTextActive: { color: '#0284c7' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
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
