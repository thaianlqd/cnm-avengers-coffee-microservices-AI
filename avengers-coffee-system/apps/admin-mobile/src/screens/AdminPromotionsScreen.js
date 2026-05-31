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
  Switch
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { colors, radius, shadows, spacing } from '../theme'
import { safeArray } from '../lib/adminData'

const TEAL = '#0ea5e9'

// Normalize promotion objects from various backend shapes to the UI shape
function normalizePromotion(p = {}) {
  const raw = { ...p }
  const discountValue = raw.discount_value ?? raw.gia_tri ?? raw.gia_tri_giam ?? raw.phan_tram_giam ?? 0
  const minOrder = raw.min_order_value ?? raw.don_hang_toi_thieu ?? raw.don_toi_thieu ?? 0
  const maxDiscount = raw.max_discount ?? raw.muc_km_max ?? raw.max_discount_value ?? null

  let discountType = raw.discount_type
  if (!discountType && raw.loai_khuyen_mai) {
    const t = String(raw.loai_khuyen_mai).toUpperCase()
    discountType = (t.includes('PERCENT') || t === 'PERCENT' || t === 'PHAN_TRAM') ? 'PERCENTAGE' : 'FIXED_AMOUNT'
  }

  return {
    promotion_code: raw.promotion_code || raw.ma_khuyen_mai || raw.code || String(raw.id || ''),
    title: raw.title || raw.ten_khuyen_mai || raw.name || '',
    discount_type: discountType || 'PERCENTAGE',
    discount_value: Number(discountValue),
    min_order_value: Number(minOrder),
    max_discount: maxDiscount != null ? Number(maxDiscount) : null,
    usage_limit: raw.usage_limit ?? raw.sl_toi_da ?? 0,
    per_user_limit: raw.per_user_limit ?? raw.lan_1_nguoi ?? 1,
    usage_count: raw.usage_count ?? raw.so_luot_da_dung ?? 0,
    is_active: raw.is_active ?? (raw.trang_thai ? raw.trang_thai === 'ACTIVE' : true),
    display_to_customer: raw.display_to_customer ?? raw.hien_thi ?? true,
    start_date: raw.start_date || raw.ngay_bat_dau || '',
    end_date: raw.end_date || raw.ngay_ket_thuc || '',
    banner_url: raw.banner_url || raw.hinh_anh || '',
    description: raw.description || raw.mo_ta || raw.note || '',
    __raw: raw,
  }
}

export function AdminPromotionsScreen() {
  const [promotions, setPromotions] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [keyword, setKeyword] = useState('')

  // Form
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const DEFAULT_FORM = {
    promotion_code: '',
    title: '',
    discount_type: 'PERCENTAGE',
    discount_value: '0',
    min_order_value: '0',
    max_discount: '',
    usage_limit: '0',
    per_user_limit: '1',
    start_date: '',
    end_date: '',
    banner_url: '',
    description: '',
    is_active: true,
    display_to_customer: true,
  }

  const [form, setForm] = useState(DEFAULT_FORM)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/promotions/admin`)
      const list = safeArray(res?.items || res)
      const mapped = list.map(normalizePromotion)
      setPromotions(mapped)
    } catch (err) {
      console.log('Error loading promotions', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredPromotions = useMemo(() => {
    return promotions.filter(p => {
      if (keyword) {
        const q = keyword.toLowerCase()
        const n = String(p.title || '').toLowerCase()
        const c = String(p.promotion_code || '').toLowerCase()
        if (!n.includes(q) && !c.includes(q)) return false
      }
      return true
    })
  }, [promotions, keyword])

  const openCreate = () => {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setModalVisible(true)
  }

  const openEdit = (p) => {
    setEditingId(p.promotion_code)
    setForm({
      promotion_code: p.promotion_code || '',
      title: p.title || '',
      discount_type: p.discount_type || 'PERCENTAGE',
      discount_value: String(p.discount_value || 0),
      min_order_value: String(p.min_order_value || 0),
      max_discount: p.max_discount ? String(p.max_discount) : '',
      usage_limit: String(p.usage_limit || 0),
      per_user_limit: String(p.per_user_limit || 1),
      start_date: p.start_date ? p.start_date.substring(0, 10) : '',
      end_date: p.end_date ? p.end_date.substring(0, 10) : '',
      banner_url: p.banner_url || '',
      description: p.description || '',
      is_active: p.is_active ?? true,
      display_to_customer: p.display_to_customer ?? true,
    })
    setModalVisible(true)
  }

  const handleDelete = (p) => {
    Alert.alert('Xác nhận', `Bạn muốn xóa mã KM ${p.promotion_code}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/promotions/admin/${p.promotion_code}`)
          Alert.alert('Thành công', 'Đã xóa mã KM')
          loadData()
        } catch (e) {
          Alert.alert('Lỗi', 'Không thể xóa mã KM')
        }
      }}
    ])
  }

  const handleSave = async () => {
    if (!form.promotion_code || !form.title) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ mã và tên KM')
      return
    }
    
    // Parse numeric fields
    const payload = {
      ...form,
      discount_value: Number(form.discount_value),
      min_order_value: Number(form.min_order_value),
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      usage_limit: Number(form.usage_limit),
      per_user_limit: Number(form.per_user_limit),
    }

    // Adjust dates for format yyyy-mm-dd
    if (payload.start_date) payload.start_date = payload.start_date.includes('T') ? payload.start_date : `${payload.start_date}T00:00:00Z`
    if (payload.end_date) payload.end_date = payload.end_date.includes('T') ? payload.end_date : `${payload.end_date}T23:59:59Z`

    setSaving(true)
    try {
      // Create backend-friendly payload (include both English and Vietnamese field names)
      const backendPayload = {
        ...payload,
        ma_khuyen_mai: payload.promotion_code,
        ten_khuyen_mai: payload.title,
        gia_tri: payload.discount_value,
        loai_khuyen_mai: payload.discount_type === 'PERCENTAGE' ? 'PERCENT' : 'FIXED',
        don_hang_toi_thieu: payload.min_order_value,
        muc_km_max: payload.max_discount ?? payload.max_discount,
        // keep English fields too for APIs that accept them
        promotion_code: payload.promotion_code,
        title: payload.title,
      }

      if (editingId) {
        // Cập nhật
        await apiClient.patch(`/promotions/admin/${editingId}`, backendPayload)
        Alert.alert('Thành công', 'Đã cập nhật KM')
      } else {
        // Tạo mới
        await apiClient.post(`/promotions/admin`, backendPayload)
        Alert.alert('Thành công', 'Đã tạo KM mới')
      }
      setModalVisible(false)
      loadData()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu KM')
    } finally {
      setSaving(false)
    }
  }

  if (loading && promotions.length === 0) {
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
          <Text style={styles.pageTitle} numberOfLines={1}>Khuyến mãi</Text>
          <Text style={styles.pageSubtitle} numberOfLines={1}>Quản lý mã giảm giá, voucher</Text>
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
            placeholder="Tìm theo mã, tên chương trình..."
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredPromotions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Không tìm thấy khuyến mãi phù hợp</Text>
          </View>
        ) : (
          filteredPromotions.map((p, index) => (
            <View key={p.promotion_code || index} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.info}>
                  <View style={styles.iconBox}>
                    <Ionicons name="ticket" size={24} color={TEAL} />
                  </View>
                  <View>
                    <Text style={styles.title}>{p.title}</Text>
                    <Text style={styles.codeText}>{p.promotion_code}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(p)}>
                    <Ionicons name="pencil" size={18} color={TEAL} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(p)}>
                    <Ionicons name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.row}>
                  <Text style={styles.label}>Loại:</Text>
                  <Text style={styles.value}>{p.discount_type === 'PERCENTAGE' ? 'Giảm %' : 'Giảm tiền mặt'}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Giá trị:</Text>
                  <Text style={styles.value}>
                    {p.discount_type === 'PERCENTAGE' ? `${p.discount_value}%` : `${p.discount_value}đ`}
                    {p.max_discount ? ` (Tối đa ${p.max_discount}đ)` : ''}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Điều kiện:</Text>
                  <Text style={styles.value}>Đơn tối thiểu {p.min_order_value}đ | {p.per_user_limit} lần/người</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Lượt dùng:</Text>
                  <Text style={styles.value}>{p.usage_count} / {p.usage_limit ? p.usage_limit : 'Vô hạn'}</Text>
                </View>
                <View style={styles.tags}>
                  <View style={[styles.statusTag, p.is_active ? styles.statusActive : styles.statusInactive]}>
                    <Text style={[styles.statusTagText, p.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
                      {p.is_active ? 'Hiệu lực' : 'Đã tắt'}
                    </Text>
                  </View>
                  {p.display_to_customer && (
                    <View style={styles.customerTag}>
                      <Text style={styles.customerTagText}>Hiện cho KH</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Cập nhật KM' : 'Tạo KM mới'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Mã KM (Công khai)</Text>
                <TextInput style={styles.input} value={form.promotion_code} onChangeText={(t) => setForm({...form, promotion_code: t.toUpperCase()})} placeholder="VD: SUMMER20" editable={!editingId} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tên chương trình</Text>
                <TextInput style={styles.input} value={form.title} onChangeText={(t) => setForm({...form, title: t})} placeholder="VD: Giảm 20% mùa hè" />
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Loại</Text>
                  <TouchableOpacity 
                    style={styles.selectBtn} 
                    onPress={() => setForm({...form, discount_type: form.discount_type === 'PERCENTAGE' ? 'FIXED_AMOUNT' : 'PERCENTAGE'})}
                  >
                    <Text style={styles.selectBtnText}>{form.discount_type === 'PERCENTAGE' ? 'Giảm theo %' : 'Giảm tiền mặt'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Mức giảm</Text>
                  <TextInput style={styles.input} value={form.discount_value} onChangeText={(t) => setForm({...form, discount_value: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Đơn tối thiểu (đ)</Text>
                  <TextInput style={styles.input} value={form.min_order_value} onChangeText={(t) => setForm({...form, min_order_value: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Giảm tối đa (đ)</Text>
                  <TextInput style={styles.input} value={form.max_discount} onChangeText={(t) => setForm({...form, max_discount: t})} placeholder="Không giới hạn" keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>SL tối đa (0 = vô hạn)</Text>
                  <TextInput style={styles.input} value={form.usage_limit} onChangeText={(t) => setForm({...form, usage_limit: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Giới hạn mỗi KH</Text>
                  <TextInput style={styles.input} value={form.per_user_limit} onChangeText={(t) => setForm({...form, per_user_limit: t})} keyboardType="numeric" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Ngày Bắt Đầu</Text>
                  <TextInput style={styles.input} value={form.start_date} onChangeText={(t) => setForm({...form, start_date: t})} placeholder="YYYY-MM-DD" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Ngày Kết Thúc</Text>
                  <TextInput style={styles.input} value={form.end_date} onChangeText={(t) => setForm({...form, end_date: t})} placeholder="YYYY-MM-DD" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Mô tả</Text>
                <TextInput style={[styles.input, { height: 80 }]} value={form.description} onChangeText={(t) => setForm({...form, description: t})} placeholder="Nhập mô tả..." multiline />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Kích hoạt</Text>
                <Switch value={form.is_active} onValueChange={(v) => setForm({...form, is_active: v})} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>Hiển thị cho khách hàng</Text>
                <Switch value={form.display_to_customer} onValueChange={(v) => setForm({...form, display_to_customer: v})} />
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Lưu Khuyến Mãi</Text>}
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
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: TEAL + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  codeText: { fontSize: 14, color: '#64748b', fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  cardBody: { gap: 6, backgroundColor: '#f8fafc', padding: 12, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 80, fontSize: 13, color: '#64748b' },
  value: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '500' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusTagText: { fontSize: 11, fontWeight: '600' },
  statusActive: { backgroundColor: '#dcfce7' },
  statusActiveText: { color: '#166534' },
  statusInactive: { backgroundColor: '#fee2e2' },
  statusInactiveText: { color: '#991b1b' },
  customerTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#e0e7ff' },
  customerTagText: { fontSize: 11, fontWeight: '600', color: '#3730a3' },
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
  selectBtn: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
  },
  selectBtnText: { fontSize: 15, color: '#0f172a' },
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
