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

export function AdminBranchesScreen() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [keyword, setKeyword] = useState('')

  // Form
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    ma_chi_nhanh: '',
    ten_chi_nhanh: '',
    dia_chi_chi_tiet: '',
    thanh_pho: 'HO_CHI_MINH',
    quan_huyen: '',
    phuong_xa: '',
    so_dien_thoai: '',
    gio_mo_cua: '07:00',
    gio_dong_cua: '22:00',
    trang_thai: 'ACTIVE',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/users/admin/branches`)
      setBranches(safeArray(res?.items || res))
    } catch (err) {
      console.log('Error loading branches', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredBranches = useMemo(() => {
    return branches.filter(b => {
      if (keyword) {
        const q = keyword.toLowerCase()
        const n = String(b.ten_chi_nhanh || '').toLowerCase()
        const c = String(b.ma_chi_nhanh || '').toLowerCase()
        if (!n.includes(q) && !c.includes(q)) return false
      }
      return true
    })
  }, [branches, keyword])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ma_chi_nhanh: '',
      ten_chi_nhanh: '',
      dia_chi_chi_tiet: '',
      thanh_pho: 'HO_CHI_MINH',
      quan_huyen: '',
      phuong_xa: '',
      so_dien_thoai: '',
      gio_mo_cua: '07:00',
      gio_dong_cua: '22:00',
      trang_thai: 'ACTIVE',
    })
    setModalVisible(true)
  }

  const openEdit = (b) => {
    setEditingId(b.ma_chi_nhanh)
    setForm({
      ma_chi_nhanh: b.ma_chi_nhanh || '',
      ten_chi_nhanh: b.ten_chi_nhanh || '',
      dia_chi_chi_tiet: b.dia_chi_chi_tiet || '',
      thanh_pho: b.thanh_pho || 'HO_CHI_MINH',
      quan_huyen: b.quan_huyen || '',
      phuong_xa: b.phuong_xa || '',
      so_dien_thoai: b.so_dien_thoai || '',
      gio_mo_cua: b.gio_mo_cua || '07:00',
      gio_dong_cua: b.gio_dong_cua || '22:00',
      trang_thai: b.trang_thai || 'ACTIVE',
    })
    setModalVisible(true)
  }

  const handleDelete = (b) => {
    Alert.alert('Xác nhận', `Bạn muốn xóa chi nhánh ${b.ten_chi_nhanh}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/users/admin/branches/${b.ma_chi_nhanh}`)
          Alert.alert('Thành công', 'Đã xóa chi nhánh')
          loadData()
        } catch (e) {
          Alert.alert('Lỗi', 'Không thể xóa chi nhánh (Có thể đang có người dùng/dữ liệu)')
        }
      }}
    ])
  }

  const handleSave = async () => {
    if (!form.ma_chi_nhanh || !form.ten_chi_nhanh) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ mã và tên chi nhánh')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        // Cập nhật
        await apiClient.patch(`/users/admin/branches/${editingId}`, form)
        Alert.alert('Thành công', 'Đã cập nhật chi nhánh')
      } else {
        // Tạo mới
        await apiClient.post(`/users/admin/branches`, form)
        Alert.alert('Thành công', 'Đã tạo chi nhánh mới')
      }
      setModalVisible(false)
      loadData()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu chi nhánh')
    } finally {
      setSaving(false)
    }
  }

  if (loading && branches.length === 0) {
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
          <Text style={styles.pageTitle} numberOfLines={1}>Chi nhánh</Text>
          <Text style={styles.pageSubtitle} numberOfLines={1}>Quản lý cơ sở trên toàn quốc</Text>
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
            placeholder="Tìm theo mã, tên chi nhánh..."
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredBranches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Không tìm thấy chi nhánh phù hợp</Text>
          </View>
        ) : (
          filteredBranches.map(b => (
            <View key={b.ma_chi_nhanh} style={styles.userCard}>
              <View style={styles.userCardHeader}>
                <View style={styles.userInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(b.ten_chi_nhanh || 'B')[0].toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.userName}>{b.ten_chi_nhanh}</Text>
                    <Text style={styles.userUsername}>Mã: {b.ma_chi_nhanh}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(b)}>
                    <Ionicons name="pencil" size={18} color={TEAL} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(b)}>
                    <Ionicons name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.userCardBody}>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color="#64748b" />
                  <Text style={styles.infoText}>{b.dia_chi_chi_tiet || 'Chưa cập nhật địa chỉ'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color="#64748b" />
                  <Text style={styles.infoText}>{b.gio_mo_cua} - {b.gio_dong_cua}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={16} color="#64748b" />
                  <Text style={styles.infoText}>{b.so_dien_thoai || 'Chưa cập nhật SĐT'}</Text>
                </View>
                <View style={styles.tags}>
                  <View style={[styles.statusTag, b.trang_thai === 'ACTIVE' ? styles.statusActive : styles.statusInactive]}>
                    <Text style={[styles.statusTagText, b.trang_thai === 'ACTIVE' ? styles.statusActiveText : styles.statusInactiveText]}>
                      {b.trang_thai}
                    </Text>
                  </View>
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
              <Text style={styles.modalTitle}>{editingId ? 'Cập nhật chi nhánh' : 'Tạo chi nhánh'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Mã chi nhánh</Text>
                <TextInput style={styles.input} value={form.ma_chi_nhanh} onChangeText={(t) => setForm({...form, ma_chi_nhanh: t.toUpperCase()})} placeholder="VD: QUAN_1" editable={!editingId} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tên chi nhánh</Text>
                <TextInput style={styles.input} value={form.ten_chi_nhanh} onChangeText={(t) => setForm({...form, ten_chi_nhanh: t})} placeholder="VD: Avengers Quận 1" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Số điện thoại</Text>
                <TextInput style={styles.input} value={form.so_dien_thoai} onChangeText={(t) => setForm({...form, so_dien_thoai: t})} placeholder="Nhập SĐT..." keyboardType="phone-pad" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Địa chỉ chi tiết</Text>
                <TextInput style={styles.input} value={form.dia_chi_chi_tiet} onChangeText={(t) => setForm({...form, dia_chi_chi_tiet: t})} placeholder="VD: 123 Nguyễn Đình Chiểu..." />
              </View>
              
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Giờ mở cửa</Text>
                  <TextInput style={styles.input} value={form.gio_mo_cua} onChangeText={(t) => setForm({...form, gio_mo_cua: t})} placeholder="07:00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Giờ đóng cửa</Text>
                  <TextInput style={styles.input} value={form.gio_dong_cua} onChangeText={(t) => setForm({...form, gio_dong_cua: t})} placeholder="22:00" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Thành phố</Text>
                <View style={styles.radioGroup}>
                  {['HO_CHI_MINH', 'HA_NOI', 'DA_NANG'].map(r => (
                    <TouchableOpacity key={r} style={[styles.radio, form.thanh_pho === r && styles.radioActive]} onPress={() => setForm({...form, thanh_pho: r})}>
                      <Text style={[styles.radioText, form.thanh_pho === r && styles.radioTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {editingId && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Trạng thái</Text>
                  <View style={styles.radioGroup}>
                    {['ACTIVE', 'INACTIVE'].map(r => (
                      <TouchableOpacity key={r} style={[styles.radio, form.trang_thai === r && styles.radioActive]} onPress={() => setForm({...form, trang_thai: r})}>
                        <Text style={[styles.radioText, form.trang_thai === r && styles.radioTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Lưu chi nhánh</Text>}
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
  userCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
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
  userCardBody: { gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, color: '#475569' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusTagText: { fontSize: 11, fontWeight: '600' },
  statusActive: { backgroundColor: '#dcfce7' },
  statusActiveText: { color: '#166534' },
  statusInactive: { backgroundColor: '#fee2e2' },
  statusInactiveText: { color: '#991b1b' },
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
  radioGroup: { flexDirection: 'row', gap: 8 },
  radio: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    marginRight: 8,
  },
  radioActive: { borderColor: TEAL, backgroundColor: TEAL + '10' },
  radioText: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  radioTextActive: { color: TEAL, fontWeight: '600' },
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
