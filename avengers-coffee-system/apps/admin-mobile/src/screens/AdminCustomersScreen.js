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

export function AdminCustomersScreen() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Form
  const [modalVisible, setModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    ten_dang_nhap: '',
    mat_khau: '',
    ho_ten: '',
    email: '',
    trang_thai: 'ACTIVE',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/users/admin/accounts?role=CUSTOMER`)
      setCustomers(safeArray(res?.items || res))
    } catch (err) {
      console.log('Error loading customers', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (statusFilter && c.trang_thai !== statusFilter) return false
      if (keyword) {
        const q = keyword.toLowerCase()
        const n = String(c.ho_ten || '').toLowerCase()
        const un = String(c.ten_dang_nhap || '').toLowerCase()
        if (!n.includes(q) && !un.includes(q)) return false
      }
      return true
    })
  }, [customers, statusFilter, keyword])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      ten_dang_nhap: '',
      mat_khau: '',
      ho_ten: '',
      email: '',
      trang_thai: 'ACTIVE',
    })
    setModalVisible(true)
  }

  const openEdit = (user) => {
    setEditingId(user.ma_nguoi_dung)
    setForm({
      ten_dang_nhap: user.ten_dang_nhap || '',
      mat_khau: '',
      ho_ten: user.ho_ten || '',
      email: user.email || '',
      trang_thai: user.trang_thai || 'ACTIVE',
    })
    setModalVisible(true)
  }

  const handleDelete = (user) => {
    Alert.alert('Xác nhận', `Bạn muốn xóa khách hàng ${user.ten_dang_nhap}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`/users/admin/accounts/${user.ma_nguoi_dung}`)
          Alert.alert('Thành công', 'Đã xóa tài khoản')
          loadData()
        } catch (e) {
          Alert.alert('Lỗi', 'Không thể xóa tài khoản')
        }
      }}
    ])
  }

  const handleSave = async () => {
    if (!form.ten_dang_nhap || !form.ho_ten) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ username và họ tên')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        // Cập nhật
        const payload = { ...form }
        if (!payload.mat_khau) delete payload.mat_khau
        await apiClient.patch(`/users/admin/accounts/${editingId}`, payload)
        Alert.alert('Thành công', 'Đã cập nhật tài khoản khách hàng')
      } else {
        // Tạo mới
        if (!form.mat_khau) {
          Alert.alert('Lỗi', 'Vui lòng nhập mật khẩu')
          setSaving(false)
          return
        }
        await apiClient.post(`/users/admin/accounts`, { ...form, vai_tro: 'CUSTOMER' })
        Alert.alert('Thành công', 'Đã tạo tài khoản khách hàng mới')
      }
      setModalVisible(false)
      loadData()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu tài khoản')
    } finally {
      setSaving(false)
    }
  }

  if (loading && customers.length === 0) {
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
          <Text style={styles.pageTitle} numberOfLines={1}>Khách hàng</Text>
          <Text style={styles.pageSubtitle} numberOfLines={1}>Quản lý tài khoản khách hàng</Text>
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
            placeholder="Tìm theo username, họ tên..."
            value={keyword}
            onChangeText={setKeyword}
          />
        </View>
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['', 'ACTIVE', 'INACTIVE'].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
                  {s || 'Tất cả trạng thái'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Không tìm thấy khách hàng phù hợp</Text>
          </View>
        ) : (
          filteredCustomers.map(c => (
            <View key={c.ma_nguoi_dung} style={styles.userCard}>
              <View style={styles.userCardHeader}>
                <View style={styles.userInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(c.ho_ten || 'C')[0].toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.userName}>{c.ho_ten}</Text>
                    <Text style={styles.userUsername}>@{c.ten_dang_nhap}</Text>
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

              <View style={styles.userCardBody}>
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={16} color="#64748b" />
                  <Text style={styles.infoText}>{c.email || 'Chưa cập nhật email'}</Text>
                </View>
                <View style={styles.tags}>
                  <View style={[styles.statusTag, c.trang_thai === 'ACTIVE' ? styles.statusActive : styles.statusInactive]}>
                    <Text style={[styles.statusTagText, c.trang_thai === 'ACTIVE' ? styles.statusActiveText : styles.statusInactiveText]}>
                      {c.trang_thai}
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
              <Text style={styles.modalTitle}>{editingId ? 'Cập nhật khách hàng' : 'Tạo khách hàng'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formContent} showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput style={styles.input} value={form.ten_dang_nhap} onChangeText={(t) => setForm({...form, ten_dang_nhap: t})} placeholder="Nhập username..." editable={!editingId} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Họ tên</Text>
                <TextInput style={styles.input} value={form.ho_ten} onChangeText={(t) => setForm({...form, ho_ten: t})} placeholder="Nhập họ tên..." />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} value={form.email} onChangeText={(t) => setForm({...form, email: t})} placeholder="Nhập email..." />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Mật khẩu {editingId ? '(Bỏ trống nếu không đổi)' : ''}</Text>
                <TextInput style={styles.input} value={form.mat_khau} onChangeText={(t) => setForm({...form, mat_khau: t})} placeholder="Nhập mật khẩu..." secureTextEntry />
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
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Lưu khách hàng</Text>}
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
  filterRow: { flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: TEAL + '15', borderColor: TEAL },
  filterChipText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  filterChipTextActive: { color: TEAL, fontWeight: '600' },
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
