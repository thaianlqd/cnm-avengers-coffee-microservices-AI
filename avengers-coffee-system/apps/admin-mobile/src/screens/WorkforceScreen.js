import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { useAdmin } from '../context/AdminContext'
import { colors, radius, shadows, spacing } from '../theme'

// Native Date helpers to avoid dayjs dependency
function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  return new Date(date.setDate(diff))
}

function addDays(d, days) {
  const res = new Date(d)
  res.setDate(res.getDate() + days)
  return res
}

function formatYYYYMMDD(d) {
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  return [d.getFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('-')
}

function formatDDMM(d) {
  const mm = d.getMonth() + 1
  const dd = d.getDate()
  return [(dd > 9 ? '' : '0') + dd, (mm > 9 ? '' : '0') + mm].join('/')
}

function formatDDMMYYYY(d) {
  return formatDDMM(d) + '/' + d.getFullYear()
}

const DAYS_VN = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
function getDayName(d) {
  return DAYS_VN[d.getDay()]
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate()
}

const SHIFT_TYPES = [
  { id: 'SANG', label: 'Sáng', time: '07:00 - 12:00' },
  { id: 'CHIEU', label: 'Chiều', time: '12:00 - 17:00' },
  { id: 'TOI', label: 'Tối', time: '17:00 - 22:00' },
]

const TABS = {
  REQUEST: 'REQUEST',
  HISTORY: 'HISTORY',
  SCHEDULE: 'SCHEDULE',
}

export function WorkforceScreen() {
  const { sessionUsername, sessionBranchCode, admin } = useAdmin()
  const [activeTab, setActiveTab] = useState(TABS.SCHEDULE)
  const [shifts, setShifts] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Form states
  const [reqDate, setReqDate] = useState(formatYYYYMMDD(new Date()))
  const [reqShift, setReqShift] = useState('SANG')
  const [reqNote, setReqNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const startOfWeek = getMonday(currentDate)
  const endOfWeek = addDays(startOfWeek, 6)
  const daysInWeek = Array.from({ length: 7 }).map((_, i) => addDays(startOfWeek, i))

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const shiftRes = await apiClient.get(`/staff/work-shifts?staff_username=${sessionUsername}&branch_code=${sessionBranchCode}`)
      const allItems = shiftRes?.items || (Array.isArray(shiftRes) ? shiftRes : [])
      
      const regularShifts = allItems.filter(item => {
        if (String(item?.nguon_tao || '') !== 'STAFF_REQUEST') return true
        return String(item?.trang_thai_yeu_cau || '').toUpperCase() === 'APPROVED'
      })
      const requestItems = allItems.filter(item => item.nguon_tao === 'STAFF_REQUEST')

      setShifts(regularShifts)
      setRequests(requestItems)
      setError('')
    } catch (err) {
      setError('Không tải được dữ liệu lịch làm việc')
    } finally {
      setLoading(false)
    }
  }, [sessionUsername, sessionBranchCode])

  useEffect(() => { loadData() }, [loadData])

  const handleCreateRequest = async () => {
    if (!reqDate) return Alert.alert('Lỗi', 'Vui lòng nhập ngày')
    setSubmitting(true)
    try {
      await apiClient.post('/staff/work-shifts/requests', {
        shift_date: reqDate,
        shift_code: reqShift,
        note: reqNote,
        branch_code: sessionBranchCode,
        staff_username: sessionUsername,
        staff_name: admin?.tenDangNhap || sessionUsername,
      })
      Alert.alert('Thành công', 'Đã gửi yêu cầu đăng ký ca')
      setReqNote('')
      loadData()
      setActiveTab(TABS.HISTORY)
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err.message || 'Không thể gửi yêu cầu')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRequest = async (id) => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn hủy yêu cầu này?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/staff/work-shifts/requests/${id}`, {
              data: { branch_code: sessionBranchCode }
            })
            Alert.alert('Thành công', 'Đã hủy yêu cầu')
            loadData()
          } catch (err) {
            Alert.alert('Lỗi', err?.response?.data?.message || err.message || 'Không thể hủy yêu cầu')
          }
        }
      }
    ])
  }

  const goPrevWeek = () => setCurrentDate(prev => addDays(prev, -7))
  const goNextWeek = () => setCurrentDate(prev => addDays(prev, 7))
  const goCurrentWeek = () => setCurrentDate(new Date())

  const getShiftForSlot = (dateObj, shiftType) => {
    const dateStr = formatYYYYMMDD(dateObj)
    return shifts.find(
      s => s.ngay_lam_viec.startsWith(dateStr) && s.ca_lam === shiftType && s.trang_thai !== 'Tu choi'
    )
  }

  const scheduledCount = shifts.length
  const completedCount = shifts.filter(s => s.trang_thai_diem_danh === 'Hoan thanh').length
  const missingCount = shifts.filter(s => s.trang_thai_diem_danh === 'Vang mat').length

  const pendingRequests = requests.filter(r => r.trang_thai_yeu_cau === 'PENDING')
  const approvedRequests = requests.filter(r => r.trang_thai_yeu_cau === 'APPROVED')
  const rejectedRequests = requests.filter(r => r.trang_thai_yeu_cau === 'REJECTED')

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Lịch làm của bạn</Text>
        <Text style={styles.pageSubtitle}>{sessionUsername} · Cơ sở {sessionBranchCode}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{scheduledCount}</Text>
          <Text style={styles.statLabel}>Tổng ca đã xếp</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{completedCount}</Text>
          <Text style={styles.statLabel}>Ca đã hoàn thành</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{missingCount}</Text>
          <Text style={styles.statLabel}>Ca vắng mặt</Text>
        </View>
      </ScrollView>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <Pressable
            style={[styles.tabBtn, activeTab === TABS.REQUEST && styles.tabBtnActive]}
            onPress={() => setActiveTab(TABS.REQUEST)}
          >
            <Text style={[styles.tabText, activeTab === TABS.REQUEST && styles.tabTextActive]}>Yêu cầu mới</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === TABS.HISTORY && styles.tabBtnActive]}
            onPress={() => setActiveTab(TABS.HISTORY)}
          >
            <Text style={[styles.tabText, activeTab === TABS.HISTORY && styles.tabTextActive]}>Lịch sử yêu cầu</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, activeTab === TABS.SCHEDULE && styles.tabBtnActive]}
            onPress={() => setActiveTab(TABS.SCHEDULE)}
          >
            <Text style={[styles.tabText, activeTab === TABS.SCHEDULE && styles.tabTextActive]}>Lịch làm việc</Text>
          </Pressable>
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* TAB: YÊU CẦU MỚI */}
      {activeTab === TABS.REQUEST && (
        <View style={styles.tabContentCard}>
          <Text style={styles.cardTitle}>Gửi yêu cầu đăng ký ca mới</Text>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Ngày muốn đăng ký (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={reqDate}
              onChangeText={setReqDate}
              placeholder="VD: 2026-06-01"
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Khung ca</Text>
            <View style={styles.radioRow}>
              {SHIFT_TYPES.map(shift => (
                <Pressable
                  key={shift.id}
                  style={[styles.radioBtn, reqShift === shift.id && styles.radioBtnActive]}
                  onPress={() => setReqShift(shift.id)}
                >
                  <Text style={[styles.radioText, reqShift === shift.id && styles.radioTextActive]}>{shift.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Lý do / Ghi chú</Text>
            <TextInput
              style={styles.input}
              value={reqNote}
              onChangeText={setReqNote}
              placeholder="Ví dụ: đăng ký ca bổ sung"
            />
          </View>
          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleCreateRequest}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Gửi yêu cầu đăng ký ca</Text>}
          </Pressable>
        </View>
      )}

      {/* TAB: LỊCH SỬ YÊU CẦU */}
      {activeTab === TABS.HISTORY && (
        <View style={styles.tabContentCard}>
          <Text style={styles.cardTitle}>Lịch sử yêu cầu đăng ký ca</Text>
          {requests.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có yêu cầu nào.</Text>
          ) : (
            <View>
              {pendingRequests.length > 0 && (
                <View style={styles.reqSection}>
                  <Text style={styles.reqSectionTitle}>Yêu cầu đang chờ duyệt ({pendingRequests.length})</Text>
                  {pendingRequests.map(r => (
                    <View key={r.ma_ca_lam_viec} style={styles.reqCard}>
                      <View style={styles.reqHead}>
                        <View>
                          <Text style={styles.reqCa}>{r.ten_ca}</Text>
                          <Text style={styles.reqDate}>{r.ngay_lam_viec} • {r.gio_bat_dau} - {r.gio_ket_thuc}</Text>
                        </View>
                        <View style={[styles.reqStatus, { backgroundColor: colors.warningBg }]}>
                          <Text style={[styles.reqStatusText, { color: colors.warning }]}>PENDING</Text>
                        </View>
                      </View>
                      {r.note ? <Text style={styles.reqNote}>Ghi chú: {r.note}</Text> : null}
                      <Pressable style={styles.reqDeleteBtn} onPress={() => handleDeleteRequest(r.ma_ca_lam_viec)}>
                        <Text style={styles.reqDeleteText}>Hủy yêu cầu</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {approvedRequests.length > 0 && (
                <View style={styles.reqSection}>
                  <Text style={styles.reqSectionTitle}>Yêu cầu đã duyệt ({approvedRequests.length})</Text>
                  {approvedRequests.map(r => (
                    <View key={r.ma_ca_lam_viec} style={styles.reqCard}>
                      <View style={styles.reqHead}>
                        <View>
                          <Text style={styles.reqCa}>{r.ten_ca}</Text>
                          <Text style={styles.reqDate}>{r.ngay_lam_viec} • {r.gio_bat_dau} - {r.gio_ket_thuc}</Text>
                        </View>
                        <View style={[styles.reqStatus, { backgroundColor: colors.successBg }]}>
                          <Text style={[styles.reqStatusText, { color: colors.success }]}>APPROVED</Text>
                        </View>
                      </View>
                      {r.note ? <Text style={styles.reqNote}>Ghi chú: {r.note}</Text> : null}
                      {r.ghi_chu_duyet ? <Text style={styles.reqNote}>Phản hồi: {r.ghi_chu_duyet}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {rejectedRequests.length > 0 && (
                <View style={styles.reqSection}>
                  <Text style={styles.reqSectionTitle}>Yêu cầu bị từ chối ({rejectedRequests.length})</Text>
                  {rejectedRequests.map(r => (
                    <View key={r.ma_ca_lam_viec} style={styles.reqCard}>
                      <View style={styles.reqHead}>
                        <View>
                          <Text style={styles.reqCa}>{r.ten_ca}</Text>
                          <Text style={styles.reqDate}>{r.ngay_lam_viec} • {r.gio_bat_dau} - {r.gio_ket_thuc}</Text>
                        </View>
                        <View style={[styles.reqStatus, { backgroundColor: colors.dangerBg }]}>
                          <Text style={[styles.reqStatusText, { color: colors.danger }]}>REJECTED</Text>
                        </View>
                      </View>
                      {r.note ? <Text style={styles.reqNote}>Ghi chú: {r.note}</Text> : null}
                      {r.ghi_chu_duyet ? <Text style={styles.reqNote}>Lý do: {r.ghi_chu_duyet}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* TAB: THỜI KHÓA BIỂU */}
      {activeTab === TABS.SCHEDULE && (
        <View style={[styles.calendarCard, shadows.sm]}>
          <View style={styles.calHeader}>
            <View>
              <Text style={styles.calTitle}>Lịch làm theo tuần</Text>
              <Text style={styles.calDateRange}>
                {formatDDMM(startOfWeek)} - {formatDDMMYYYY(endOfWeek)}
              </Text>
            </View>
            <View style={styles.navRow}>
              <Pressable onPress={goPrevWeek} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
              <Pressable onPress={goCurrentWeek} style={styles.navBtnCurrent}><Text style={styles.navCurrentText}>Hiện tại</Text></Pressable>
              <Pressable onPress={goNextWeek} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.gridContainer}>
              {/* Header Row */}
              <View style={styles.gridRow}>
                <View style={[styles.gridCell, styles.gridHeaderCell, { width: 80 }]}>
                  <Text style={styles.headerText}>Ca làm</Text>
                </View>
                {daysInWeek.map((d, i) => (
                  <View key={i} style={[styles.gridCell, styles.gridHeaderCell]}>
                    <Text style={styles.dayText}>{getDayName(d)}</Text>
                    <Text style={styles.dateText}>{formatDDMM(d)}</Text>
                  </View>
                ))}
              </View>

              {/* Shift Rows */}
              {SHIFT_TYPES.map((shift, rIdx) => (
                <View key={shift.id} style={styles.gridRow}>
                  <View style={[styles.gridCell, styles.timeCell, { width: 80 }]}>
                    <Text style={styles.shiftLabel}>{shift.label}</Text>
                    <Text style={styles.shiftTime}>{shift.time}</Text>
                  </View>
                  {daysInWeek.map((d, cIdx) => {
                    const s = getShiftForSlot(d, shift.id)
                    const isToday = isSameDay(d, new Date())
                    return (
                      <View key={cIdx} style={[styles.gridCell, isToday && styles.todayCell]}>
                        {s ? (
                          <View style={[styles.shiftBlock, s.trang_thai === 'Da duyet' ? styles.shiftApproved : styles.shiftPending]}>
                            <Text style={[styles.shiftBlockText, s.trang_thai === 'Da duyet' ? { color: colors.success } : { color: colors.warning }]}>
                              {s.trang_thai === 'Da duyet' ? 'Đã xếp' : 'Chờ duyệt'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.emptyCellText}>Trống</Text>
                        )}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 100 },
  headerTitleContainer: { marginBottom: spacing.md, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  statsScroll: { paddingHorizontal: spacing.lg, gap: 12, marginBottom: spacing.lg, paddingRight: 32 },
  statBox: { backgroundColor: colors.card, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 120 },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 4 },
  errorBox: { marginHorizontal: spacing.lg, backgroundColor: colors.dangerBg, padding: 12, borderRadius: radius.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
  
  tabContainer: { marginBottom: spacing.lg },
  tabScroll: { paddingHorizontal: spacing.lg, gap: 8 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: 'bold', color: colors.muted },
  tabTextActive: { color: '#fff' },

  tabContentCard: { marginHorizontal: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.borderLight },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 16 },
  
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: colors.muted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, fontSize: 14, color: colors.text },
  radioRow: { flexDirection: 'row', gap: 8 },
  radioBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.sm, backgroundColor: colors.surface },
  radioBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  radioText: { fontSize: 13, fontWeight: '600', color: colors.text },
  radioTextActive: { color: colors.primary },
  submitBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.sm, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 10 },
  reqSection: { marginBottom: 20 },
  reqSectionTitle: { fontSize: 14, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 12 },
  reqCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.sm, padding: 12, marginBottom: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    marginBottom: spacing.md,
  },
  reqCa: { fontSize: 14, fontWeight: 'bold', color: colors.text },
  reqDate: { fontSize: 12, color: colors.muted, marginTop: 4 },
  reqStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  reqStatusText: { fontSize: 10, fontWeight: 'bold' },
  reqNote: { fontSize: 12, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  reqDeleteBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: '#fff' },
  reqDeleteText: { fontSize: 12, fontWeight: '600', color: colors.text },

  calendarCard: { marginHorizontal: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden' },
  calHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  calTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  calDateRange: { fontSize: 13, color: colors.primary, marginTop: 4, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  navBtn: { backgroundColor: colors.primaryLight, padding: 6, borderRadius: radius.sm },
  navBtnCurrent: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  navCurrentText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  gridContainer: { flexDirection: 'column' },
  gridRow: { flexDirection: 'row' },
  gridCell: { width: 100, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight, padding: 8, justifyContent: 'center', alignItems: 'center', minHeight: 80 },
  gridHeaderCell: { backgroundColor: colors.surface, minHeight: 60 },
  timeCell: { backgroundColor: colors.surface },
  todayCell: { backgroundColor: colors.infoBg + '50' },
  headerText: { fontSize: 12, fontWeight: 'bold', color: colors.textSecondary },
  dayText: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'capitalize' },
  dateText: { fontSize: 11, color: colors.muted, marginTop: 2 },
  shiftLabel: { fontSize: 13, fontWeight: 'bold', color: colors.text },
  shiftTime: { fontSize: 10, color: colors.muted, marginTop: 4, textAlign: 'center' },
  emptyCellText: { fontSize: 12, color: colors.placeholder },
  shiftBlock: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, width: '100%', alignItems: 'center' },
  shiftApproved: { backgroundColor: colors.successBg },
  shiftPending: { backgroundColor: colors.warningBg },
  shiftBlockText: { fontSize: 11, fontWeight: 'bold' },
})