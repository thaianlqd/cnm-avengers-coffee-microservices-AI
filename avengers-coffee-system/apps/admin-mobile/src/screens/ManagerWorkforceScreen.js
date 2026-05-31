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

const SHIFT_CODE_LABEL = {
  SANG: '☀️ Ca Sáng',
  CHIEU: '🌤 Ca Chiều',
  TOI: '🌙 Ca Tối',
}

const ATTENDANCE_COLOR = {
  PENDING: '#f59e0b',
  CHECKED_IN: TEAL,
  CHECKED_OUT: '#22c55e',
  ABSENT: '#ef4444',
}

const REQUEST_STATUS_LABEL = {
  PENDING: 'Đang chờ',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
}

const REQUEST_STATUS_COLOR = {
  PENDING: '#f59e0b',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444',
}

function CreateShiftModal({ visible, onClose, onSubmit, loading, employees }) {
  const [staffUsername, setStaffUsername] = useState('')
  const [staffName, setStaffName] = useState('')
  const [shiftDate, setShiftDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [shiftCodes, setShiftCodes] = useState(['SANG'])
  const [note, setNote] = useState('')

  const PRESET_CHECKLISTS = [
    'Pha chế đồ uống theo giờ cao điểm',
    'Thu ngân + hỗ trợ đóng gói đơn mang đi',
    'Chuẩn bị topping, nguyên liệu trước ca',
    'Kiểm kê quầy bar cuối ca',
    'Dọn vệ sinh khu vực khách ngồi'
  ]

  const toggleShiftCode = (code) => {
    setShiftCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const addChecklist = (text) => {
    setNote((prev) => {
      const current = prev.trim()
      return current ? `${current}\n- ${text}` : `- ${text}`
    })
  }

  const handleSelectEmployee = (emp) => {
    setStaffUsername(emp.ten_dang_nhap || '')
    setStaffName(emp.ho_ten || emp.ten_dang_nhap || '')
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>Phân công ca làm</Text>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={modalStyles.body}>
          {/* Employee picker */}
          {employees.length > 0 ? (
            <>
              <Text style={modalStyles.fieldLabel}>Chọn nhân viên</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {employees.map((emp) => (
                    <Pressable
                      key={emp.ten_dang_nhap || emp.ma_nguoi_dung}
                      onPress={() => handleSelectEmployee(emp)}
                      style={[
                        modalStyles.empChip,
                        staffUsername === emp.ten_dang_nhap && modalStyles.empChipActive,
                      ]}
                    >
                      <Text style={[modalStyles.empChipText, staffUsername === emp.ten_dang_nhap && { color: TEAL }]}>
                        {emp.ho_ten || emp.ten_dang_nhap}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}

          <Text style={modalStyles.fieldLabel}>Username nhân viên *</Text>
          <TextInput
            value={staffUsername}
            onChangeText={setStaffUsername}
            placeholder="Ví dụ: thaian_staff"
            placeholderTextColor="#4b5563"
            style={modalStyles.input}
          />
          <Text style={modalStyles.fieldLabel}>Tên nhân viên</Text>
          <TextInput
            value={staffName}
            onChangeText={setStaffName}
            placeholder="Tên hiển thị"
            placeholderTextColor="#4b5563"
            style={modalStyles.input}
          />
          <Text style={modalStyles.fieldLabel}>Ngày làm *</Text>
          <TextInput
            value={shiftDate}
            onChangeText={setShiftDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#4b5563"
            style={modalStyles.input}
          />
          <Text style={modalStyles.fieldLabel}>Ca làm (Chọn nhiều) *</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {Object.entries(SHIFT_CODE_LABEL).map(([code, label]) => {
              const isSelected = shiftCodes.includes(code)
              return (
                <Pressable
                  key={code}
                  onPress={() => toggleShiftCode(code)}
                  style={[modalStyles.shiftOption, isSelected && modalStyles.shiftOptionActive, { flex: 1, padding: 8 }]}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={isSelected ? TEAL : '#6b7280'}
                  />
                  <Text style={[modalStyles.shiftOptionText, isSelected && { color: TEAL }, { fontSize: 11 }]}>{label.replace(/.* /, '')}</Text>
                </Pressable>
              )
            })}
          </View>
          
          <Text style={modalStyles.fieldLabel}>Phân công việc làm (Checklist nhanh)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {PRESET_CHECKLISTS.map((text, idx) => (
              <Pressable key={idx} onPress={() => addChecklist(text)} style={modalStyles.checklistBtn}>
                <Text style={modalStyles.checklistText}>+ {text}</Text>
              </Pressable>
            ))}
          </View>
          
          <Text style={modalStyles.fieldLabel}>Ghi chú</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ghi chú thêm"
            placeholderTextColor="#4b5563"
            multiline
            numberOfLines={2}
            style={[modalStyles.input, { height: 60, textAlignVertical: 'top', paddingTop: 10 }]}
          />
          <Pressable
            disabled={loading || !staffUsername.trim() || shiftCodes.length === 0}
            onPress={() => onSubmit({ staff_username: staffUsername.trim(), staff_name: staffName.trim(), shift_date: shiftDate, shift_codes: shiftCodes, note: note.trim() })}
            style={modalStyles.submitBtn}
          >
            <LinearGradient colors={[TEAL, '#0284c7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={modalStyles.submitGrad}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={modalStyles.submitText}>Tạo lịch làm</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function ManagerWorkforceScreen() {
  const { sessionBranchCode, sessionUsername } = useAdmin()
  const [allShifts, setAllShifts] = useState([])
  const [employees, setEmployees] = useState([])
  const [shiftRequests, setShiftRequests] = useState([])
  const [loading, setLoading] = useState({ shifts: true, create: false, handle: false })
  const [showCreate, setShowCreate] = useState(false)
  const [handlingId, setHandlingId] = useState('')
  const [activeTab, setActiveTab] = useState('calendar')
  const [attendanceUpdatingId, setAttendanceUpdatingId] = useState('')

  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'

  // GET /manager/work-shifts?branch_code=X
  const loadAllShifts = useCallback(async () => {
    setLoading((p) => ({ ...p, shifts: true }))
    try {
      const response = await apiClient.get(`/manager/work-shifts?branch_code=${encodeURIComponent(branchCode)}`)
      const arr = response?.items || (Array.isArray(response) ? response : [])
      setAllShifts(arr.filter((i) => String(i?.trang_thai_yeu_cau || '').toUpperCase() !== 'PENDING' || String(i?.nguon_tao || '') !== 'STAFF_REQUEST'))
    } catch {
      setAllShifts([])
    } finally {
      setLoading((p) => ({ ...p, shifts: false }))
    }
  }, [branchCode])

  // GET /users/workforce?branch_code=X
  const loadEmployees = useCallback(async () => {
    try {
      const response = await apiClient.get(`/users/workforce?branch_code=${encodeURIComponent(branchCode)}`)
      setEmployees(response?.items || (Array.isArray(response) ? response : []))
    } catch {
      setEmployees([])
    }
  }, [branchCode])

  // GET /manager/work-shifts/requests?branch_code=X
  const loadRequests = useCallback(async () => {
    try {
      const response = await apiClient.get(`/manager/work-shifts/requests?branch_code=${encodeURIComponent(branchCode)}`)
      const arr = response?.items || (Array.isArray(response) ? response : [])
      setShiftRequests(arr.filter((i) => i?.nguon_tao === 'STAFF_REQUEST'))
    } catch {
      setShiftRequests([])
    }
  }, [branchCode])

  useEffect(() => {
    loadAllShifts()
    loadEmployees()
    loadRequests()
  }, [loadAllShifts, loadEmployees, loadRequests])

  // POST /manager/work-shifts
  const handleCreateShift = async (form) => {
    setLoading((p) => ({ ...p, create: true }))
    try {
      await apiClient.post('/manager/work-shifts', {
        ...form,
        shift_codes: form.shift_codes,
        manager_username: sessionUsername || 'manager',
        branch_code: branchCode,
      })
      setShowCreate(false)
      Alert.alert('Thành công', `Đã tạo lịch làm cho ${form.staff_username}`)
      await loadAllShifts()
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Tạo lịch thất bại')
    } finally {
      setLoading((p) => ({ ...p, create: false }))
    }
  }

  // DELETE /manager/work-shifts/:id
  const handleDeleteShift = (shiftId) => {
    Alert.alert('Xóa lịch làm', 'Bạn có chắc muốn xóa ca làm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/manager/work-shifts/${shiftId}?branch_code=${encodeURIComponent(branchCode)}`)
            await loadAllShifts()
          } catch (err) {
            Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Xóa thất bại')
          }
        },
      },
    ])
  }

  // PATCH /manager/work-shifts/:id/attendance
  const handleUpdateAttendance = async (shiftId, field, value) => {
    setAttendanceUpdatingId(String(shiftId))
    try {
      await apiClient.patch(`/manager/work-shifts/${shiftId}/attendance`, {
        [field]: value,
        branch_code: branchCode,
      })
      await loadAllShifts()
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Cập nhật thất bại')
    } finally {
      setAttendanceUpdatingId('')
    }
  }

  // PATCH /manager/work-shifts/requests/:id
  const handleRequest = async (requestId, approved) => {
    setHandlingId(String(requestId))
    try {
      await apiClient.patch(`/manager/work-shifts/requests/${requestId}`, {
        status: approved ? 'APPROVED' : 'REJECTED',
        branch_code: branchCode,
      })
      await Promise.all([loadRequests(), loadAllShifts()])
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Xử lý thất bại')
    } finally {
      setHandlingId('')
    }
  }

  const pendingRequests = shiftRequests.filter((r) => {
    const s = String(r.trang_thai_yeu_cau || '').toUpperCase()
    return s === 'PENDING' || !s
  })

  const TABS = [
    { key: 'calendar', label: '📅 Lịch làm NV' },
    { key: 'requests', label: `📝 Yêu cầu (${pendingRequests.length})` },
  ]

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#ffffff', '#f1f5f9']} style={styles.header}>
        <Text style={styles.headerTitle}>Quản lý lịch làm nhân viên</Text>
        <Text style={styles.headerSub}>{allShifts.length} ca · {employees.length} nhân viên</Text>
      </LinearGradient>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* CALENDAR TAB */}
      {activeTab === 'calendar' ? (
        <FlatList
          data={allShifts}
          keyExtractor={(item, idx) => String(item.id || item.ma_ca_lam || idx)}
          renderItem={({ item }) => {
            const attendance = String(item.trang_thai_cham_cong || 'PENDING').toUpperCase()
            const attColor = ATTENDANCE_COLOR[attendance] || '#9ca3af'
            const isUpdating = attendanceUpdatingId === String(item.id || item.ma_ca_lam)
            return (
              <View style={styles.shiftCard}>
                <View style={styles.shiftTop}>
                  <View>
                    <Text style={styles.shiftName}>{item.staff_name || item.staff_username || '—'}</Text>
                    <Text style={styles.shiftDate}>{item.shift_date || '—'} · {SHIFT_CODE_LABEL[item.shift_code] || item.shift_code}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={[styles.attBadge, { backgroundColor: attColor + '25' }]}>
                      <Text style={[styles.attText, { color: attColor }]}>
                        {attendance === 'CHECKED_IN' ? 'Đã vào' : attendance === 'CHECKED_OUT' ? 'Đã ra' : attendance === 'ABSENT' ? 'Vắng' : 'Chờ'}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleDeleteShift(item.id || item.ma_ca_lam)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    </Pressable>
                  </View>
                </View>
                {/* Manager chấm công */}
                {attendance === 'PENDING' ? (
                  <View style={styles.attActions}>
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => handleUpdateAttendance(item.id || item.ma_ca_lam, 'check_in_time', new Date().toISOString())}
                      style={styles.checkInBtn}
                    >
                      {isUpdating ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <Text style={styles.checkBtnText}>Điểm danh vào</Text>
                    </Pressable>
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => handleUpdateAttendance(item.id || item.ma_ca_lam, 'trang_thai_cham_cong', 'ABSENT')}
                      style={styles.absentBtn}
                    >
                      <Text style={styles.absentBtnText}>Vắng</Text>
                    </Pressable>
                  </View>
                ) : null}
                {attendance === 'CHECKED_IN' ? (
                  <Pressable
                    disabled={isUpdating}
                    onPress={() => handleUpdateAttendance(item.id || item.ma_ca_lam, 'check_out_time', new Date().toISOString())}
                    style={styles.checkOutBtn}
                  >
                    {isUpdating ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Text style={styles.checkBtnText}>Điểm danh ra</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Pressable onPress={() => setShowCreate(true)} style={styles.createBtn}>
              <LinearGradient colors={[TEAL, '#0284c7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.createGrad}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.createText}>Phân công ca làm mới</Text>
              </LinearGradient>
            </Pressable>
          }
          ListEmptyComponent={
            loading.shifts ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={ORANGE} size="large" /></View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="calendar-outline" size={44} color="#2a2a2e" />
                <Text style={styles.emptyText}>Chưa có lịch làm nào</Text>
              </View>
            )
          }
          onRefresh={loadAllShifts}
          refreshing={loading.shifts}
        />
      ) : null}




      {/* REQUESTS TAB */}
      {activeTab === 'requests' ? (
        <FlatList
          data={shiftRequests}
          keyExtractor={(item, idx) => String(item.id || idx)}
          renderItem={({ item }) => {
            const reqStatus = String(item.trang_thai_yeu_cau || '').toUpperCase()
            const color = REQUEST_STATUS_COLOR[reqStatus] || '#9ca3af'
            const isHandling = handlingId === String(item.id)
            const isPending = reqStatus === 'PENDING' || !reqStatus
            return (
              <View style={styles.requestCard}>
                <View style={styles.shiftTop}>
                  <View>
                    <Text style={styles.shiftName}>{item.staff_name || item.staff_username || '—'}</Text>
                    <Text style={styles.shiftDate}>{item.shift_date || '—'} · {SHIFT_CODE_LABEL[item.shift_code] || item.shift_code}</Text>
                  </View>
                  <View style={[styles.attBadge, { backgroundColor: color + '25' }]}>
                    <Text style={[styles.attText, { color }]}>{REQUEST_STATUS_LABEL[reqStatus] || reqStatus}</Text>
                  </View>
                </View>
                {item.note ? <Text style={styles.reqNote}>{item.note}</Text> : null}
                <Text style={styles.reqDate}>{formatDateTime(item.ngay_tao || item.created_at)}</Text>
                {isPending ? (
                  <View style={styles.reqActions}>
                    <Pressable
                      disabled={isHandling}
                      onPress={() => handleRequest(item.id, false)}
                      style={styles.rejectBtn}
                    >
                      {isHandling ? <ActivityIndicator size="small" color="#ef4444" /> : null}
                      <Text style={styles.rejectBtnText}>Từ chối</Text>
                    </Pressable>
                    <Pressable
                      disabled={isHandling}
                      onPress={() => handleRequest(item.id, true)}
                      style={styles.approveBtn}
                    >
                      {isHandling ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <Text style={styles.approveBtnText}>Phê duyệt</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )
          }}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={44} color="#2a2a2e" />
              <Text style={styles.emptyText}>Không có yêu cầu đăng ký ca</Text>
            </View>
          }
          onRefresh={loadRequests}
          refreshing={false}
        />
      ) : null}

      <CreateShiftModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreateShift}
        loading={loading.create}
        employees={employees}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  headerSub: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabActive: { backgroundColor: TEAL + '15', borderColor: TEAL },
  tabText: { fontSize: 10, fontWeight: '800', color: '#64748b', textAlign: 'center' },
  tabTextActive: { color: TEAL },
  listPad: { padding: 12, gap: 10, paddingBottom: 24 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: '#64748b' },
  createBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  createGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  createText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  shiftCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  shiftTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shiftName: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  shiftDate: { fontSize: 11, color: TEAL, fontWeight: '700', marginTop: 2 },
  attBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  attText: { fontSize: 10, fontWeight: '900' },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef444415',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  checkInBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 9,
  },
  checkOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  checkBtnText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  absentBtn: {
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444440',
    backgroundColor: '#ef444415',
    alignItems: 'center',
    justifyContent: 'center',
  },
  absentBtnText: { fontSize: 12, fontWeight: '800', color: '#ef4444' },
  empCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  empAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TEAL + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empAvatarText: { fontSize: 18, fontWeight: '900', color: TEAL },
  empInfo: { flex: 1, gap: 2 },
  empName: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  empUsername: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  empEmail: { fontSize: 11, color: '#475569' },
  rolePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { fontSize: 10, fontWeight: '900' },
  requestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  reqNote: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  reqDate: { fontSize: 10, color: '#475569' },
  reqActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ef444440',
    backgroundColor: '#ef444415',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '800', color: '#ef4444' },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#22c55e',
  },
  approveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
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
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 46,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  empChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  empChipActive: { borderColor: TEAL, backgroundColor: TEAL + '15' },
  empChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  shiftOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  shiftOptionActive: { borderColor: TEAL, backgroundColor: TEAL + '10' },
  shiftOptionText: { fontSize: 13, color: '#64748b', fontWeight: '700' },
  checklistBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checklistText: { fontSize: 11, fontWeight: '700', color: TEAL },
  submitBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { fontSize: 15, fontWeight: '900', color: '#fff' },
})
