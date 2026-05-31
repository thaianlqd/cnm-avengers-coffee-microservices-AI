import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'

const TEAL = '#0ea5e9'
const ORANGE = '#f26b1d'

function toDateOnlyLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getAttendanceInsight(shift) {
  if (!shift) return { flags: [] }
  const isCheckedIn = Boolean(shift.check_in_at || shift.check_in_time)
  const isCheckedOut = Boolean(shift.check_out_at || shift.check_out_time)

  let lateMinutes = 0
  let earlyLeaveMinutes = 0

  if (isCheckedIn && (shift.gio_bat_dau || shift.start_time)) {
    const shiftStart = new Date(`${toDateOnlyLocal(new Date())}T${shift.gio_bat_dau || shift.start_time}`)
    const actualIn = new Date(shift.check_in_at || shift.check_in_time)
    if (actualIn > shiftStart) {
      lateMinutes = Math.floor((actualIn - shiftStart) / 60000)
    }
  }

  if (isCheckedOut && (shift.gio_ket_thuc || shift.end_time)) {
    const shiftEnd = new Date(`${toDateOnlyLocal(new Date())}T${shift.gio_ket_thuc || shift.end_time}`)
    const actualOut = new Date(shift.check_out_at || shift.check_out_time)
    if (actualOut < shiftEnd) {
      earlyLeaveMinutes = Math.floor((shiftEnd - actualOut) / 60000)
    }
  }

  let workedHours = 0
  if (isCheckedIn) {
    const start = new Date(shift.check_in_at || shift.check_in_time)
    const end = isCheckedOut ? new Date(shift.check_out_at || shift.check_out_time) : new Date()
    workedHours = Math.max(0, (end - start) / 3600000).toFixed(1)
  }

  const flags = []
  if (lateMinutes > 15) flags.push(`Đi muộn ${lateMinutes}p`)
  if (earlyLeaveMinutes > 15) flags.push(`Về sớm ${earlyLeaveMinutes}p`)

  return {
    isCheckedIn,
    isCheckedOut,
    isLate: lateMinutes > 15,
    lateMinutes,
    leftEarly: earlyLeaveMinutes > 15,
    earlyLeaveMinutes,
    workedHours,
    flags,
  }
}

function formatMinutesLabel(mins) {
  if (!mins) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}h${m}p`
  return `${m}p`
}

function statusBadgeConfig(statusKey) {
  switch (statusKey) {
    case 'CHECKED_IN': return { label: 'Đang trong ca', color: TEAL, bg: TEAL + '20' }
    case 'COMPLETED': return { label: 'Đã check-out', color: '#22c55e', bg: '#22c55e20' }
    case 'LATE': return { label: 'Đi muộn / cần chú ý', color: '#f59e0b', bg: '#f59e0b20' }
    case 'SCHEDULED': return { label: 'Có lịch, chưa vào', color: '#8b5cf6', bg: '#8b5cf620' }
    case 'ABSENT': return { label: 'Vắng mặt', color: '#ef4444', bg: '#ef444420' }
    default: return { label: 'Nghỉ / không có lịch', color: '#6b7280', bg: '#37415120' }
  }
}

function toShiftLabel(shift) {
  if (!shift) return 'Chưa có lịch hôm nay'
  const shiftName = shift.ten_ca || shift.shift_code || 'Ca làm'
  return `${shiftName}: ${shift.gio_bat_dau || shift.start_time || '--:--'} - ${shift.gio_ket_thuc || shift.end_time || '--:--'}`
}

export function ManagerEmployeesScreen() {
  const { sessionBranchCode } = useAdmin()
  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'

  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [empRes, shiftRes] = await Promise.all([
        apiClient.get(`/users/workforce?branch_code=${encodeURIComponent(branchCode)}`),
        apiClient.get(`/manager/work-shifts?branch_code=${encodeURIComponent(branchCode)}`)
      ])
      setEmployees(empRes?.items || (Array.isArray(empRes) ? empRes : []))
      setShifts(shiftRes?.items || (Array.isArray(shiftRes) ? shiftRes : []))
    } catch (err) {
      console.log('Error loading employee data', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [branchCode])

  useEffect(() => { loadData() }, [loadData])

  const todayKey = useMemo(() => toDateOnlyLocal(new Date()), [])

  const employeeRows = useMemo(() => {
    const shiftByUser = new Map()

    shifts
      .filter((item) => (item?.ngay_lam_viec || item?.shift_date) === todayKey)
      .forEach((item) => {
        const key = item.staff_username || item.staff_name || ''
        if (!key) return
        if (!shiftByUser.has(key)) shiftByUser.set(key, [])
        shiftByUser.get(key).push(item)
      })

    shiftByUser.forEach((shs) => {
      shs.sort((a, b) => String(a.gio_bat_dau || a.start_time || '').localeCompare(String(b.gio_bat_dau || b.start_time || '')))
    })

    return employees.map((user) => {
      const username = user.ten_dang_nhap || user.username || ''
      const shiftsToday = shiftByUser.get(username) || []

      const assignedShift = shiftsToday.find((item) => (item.trang_thai_cham_cong || item.attendance_status) === 'ASSIGNED' || (item.trang_thai_cham_cong || item.attendance_status) === 'PENDING') || null
      const absentShift = shiftsToday.find((item) => (item.trang_thai_cham_cong || item.attendance_status) === 'ABSENT') || null
      const detailedShift = shiftsToday.find((item) => {
        const insight = getAttendanceInsight(item)
        return insight.isCheckedIn || insight.isCheckedOut || insight.isLate || insight.leftEarly
      }) || null

      let statusKey = 'OFF'
      let primaryShift = detailedShift || shiftsToday[0] || null
      const primaryInsight = primaryShift ? getAttendanceInsight(primaryShift) : null

      if (primaryInsight?.isLate || primaryInsight?.leftEarly) {
        statusKey = 'LATE'
      } else if (primaryInsight?.isCheckedOut) {
        statusKey = 'COMPLETED'
      } else if (primaryInsight?.isCheckedIn) {
        statusKey = 'CHECKED_IN'
      } else if (assignedShift) {
        statusKey = 'SCHEDULED'
        primaryShift = assignedShift
      } else if (absentShift) {
        statusKey = 'ABSENT'
        primaryShift = absentShift
      }

      return {
        user,
        username,
        fullName: user.ho_ten || username || 'Nhân viên',
        email: user.email || 'Chưa cập nhật',
        phone: user.so_dien_thoai || user.soDienThoai || 'Chưa cập nhật',
        branchName: user.co_so_ten || user.coSoTen || branchCode,
        role: user.vai_tro || user.vaiTro || 'STAFF',
        statusKey,
        statusMeta: statusBadgeConfig(statusKey),
        shiftsToday,
        primaryShift,
        primaryInsight,
      }
    })
  }, [todayKey, shifts, employees, branchCode])

  const filteredRows = useMemo(() => {
    const kw = normalizeText(keyword)
    return employeeRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.statusKey !== statusFilter) return false
      if (!kw) return true
      const haystack = normalizeText([row.fullName, row.username, row.email, row.phone].join(' '))
      return haystack.includes(kw)
    })
  }, [employeeRows, keyword, statusFilter])

  const summary = useMemo(() => {
    return employeeRows.reduce(
      (acc, row) => {
        acc.total += 1
        acc[row.statusKey] += 1
        return acc
      },
      { total: 0, CHECKED_IN: 0, COMPLETED: 0, LATE: 0, SCHEDULED: 0, ABSENT: 0, OFF: 0 },
    )
  }, [employeeRows])

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#ffffff', '#f1f5f9']} style={styles.header}>
        <Text style={styles.headerTitle}>Quản lý nhân viên</Text>
        <Text style={styles.headerSub}>Theo dõi thông tin nhân sự và trạng thái vào ca hôm nay</Text>
      </LinearGradient>

      {/* KPI Grid */}
      <View style={styles.kpiWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Tổng nhân viên</Text>
            <Text style={styles.kpiValue}>{summary.total}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Đang vào ca</Text>
            <Text style={[styles.kpiValue, { color: TEAL }]}>{summary.CHECKED_IN}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Đã check-out</Text>
            <Text style={[styles.kpiValue, { color: '#22c55e' }]}>{summary.COMPLETED}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Đi muộn/sớm</Text>
            <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>{summary.LATE}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Chưa vào</Text>
            <Text style={[styles.kpiValue, { color: '#8b5cf6' }]}>{summary.SCHEDULED}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Vắng mặt</Text>
            <Text style={[styles.kpiValue, { color: '#ef4444' }]}>{summary.ABSENT}</Text>
          </View>
        </ScrollView>
      </View>

      {/* Search & Filter */}
      <View style={styles.filterWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#6b7280" />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Tìm tên, username, email..."
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
          />
          {keyword ? <Pressable onPress={() => setKeyword('')}><Ionicons name="close-circle" size={16} color="#6b7280" /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {[
            { id: 'ALL', label: 'Tất cả trạng thái' },
            { id: 'CHECKED_IN', label: 'Đang vào ca' },
            { id: 'COMPLETED', label: 'Đã check-out' },
            { id: 'LATE', label: 'Đi muộn/về sớm' },
            { id: 'SCHEDULED', label: 'Có lịch chưa vào' },
            { id: 'ABSENT', label: 'Vắng mặt' },
            { id: 'OFF', label: 'Nghỉ/Không có lịch' },
          ].map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setStatusFilter(f.id)}
              style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, statusFilter === f.id && { color: TEAL }]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filteredRows}
        keyExtractor={(item) => String(item.user.ma_nguoi_dung || item.username)}
        contentContainerStyle={styles.listPad}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.empCard}>
            <View style={styles.empTop}>
              <View style={styles.empInfo}>
                <Text style={styles.empName}>{item.fullName}</Text>
                <Text style={styles.empUsername}>@{item.username} • {item.role}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: item.statusMeta.bg }]}>
                <Text style={[styles.statusText, { color: item.statusMeta.color }]}>{item.statusMeta.label}</Text>
              </View>
            </View>

            <View style={styles.empMetaGrid}>
              <Text style={styles.empMetaText}>Email: {item.email}</Text>
              <Text style={styles.empMetaText}>SĐT: {item.phone}</Text>
              <Text style={styles.empMetaText}>Cơ sở: {item.branchName}</Text>
            </View>

            <View style={styles.shiftBox}>
              <Text style={styles.shiftLabel}>{toShiftLabel(item.primaryShift)}</Text>
              <Text style={styles.shiftCount}>Số ca hôm nay: {item.shiftsToday.length}</Text>
            </View>

            {item.primaryInsight ? (
              <View style={styles.flagsRow}>
                {item.primaryInsight.flags.length ? (
                  item.primaryInsight.flags.map((flag, idx) => (
                    <View key={idx} style={styles.flagWarning}><Text style={styles.flagWarningText}>{flag}</Text></View>
                  ))
                ) : (
                  <View style={styles.flagGood}><Text style={styles.flagGoodText}>Chấm công ổn định</Text></View>
                )}
              </View>
            ) : null}

            {item.primaryShift ? (
              <View style={styles.attendanceGrid}>
                <Text style={styles.attText}>Check-in: {item.primaryShift.check_in_at || item.primaryShift.check_in_time ? new Date(item.primaryShift.check_in_at || item.primaryShift.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa có'}</Text>
                <Text style={styles.attText}>Check-out: {item.primaryShift.check_out_at || item.primaryShift.check_out_time ? new Date(item.primaryShift.check_out_at || item.primaryShift.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa có'}</Text>
                <Text style={styles.attText}>
                  Giờ thực tế: {item.primaryInsight?.workedHours || 0}h
                  {item.primaryInsight?.isLate ? ` • Muộn ${formatMinutesLabel(item.primaryInsight.lateMinutes)}` : ''}
                  {item.primaryInsight?.leftEarly ? ` • Về sớm ${formatMinutesLabel(item.primaryInsight.earlyLeaveMinutes)}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={ORANGE} size="large" /></View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={44} color="#2a2a2e" />
              <Text style={styles.emptyText}>Không có nhân viên nào phù hợp</Text>
            </View>
          )
        }
        onRefresh={() => { setRefreshing(true); loadData() }}
        refreshing={refreshing}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  headerSub: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  kpiWrap: { backgroundColor: '#ffffff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  kpiScroll: { paddingHorizontal: 12, gap: 10 },
  kpiCard: { backgroundColor: '#ffffff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', minWidth: 100, alignItems: 'center' },
  kpiLabel: { fontSize: 10, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  filterWrap: { padding: 12, gap: 10, backgroundColor: '#f8fafc' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: '#cbd5e1', gap: 8 },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 13 },
  filterChips: { gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: TEAL + '15', borderColor: TEAL },
  filterChipText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  listPad: { padding: 12, gap: 12, paddingBottom: 24 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: '#64748b' },
  empCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 },
  empTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  empInfo: { flex: 1 },
  empName: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  empUsername: { fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '900' },
  empMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empMetaText: { fontSize: 11, color: '#475569', width: '45%' },
  shiftBox: { backgroundColor: '#f26b1d10', borderRadius: 8, padding: 10, gap: 4, borderWidth: 1, borderColor: '#f26b1d30' },
  shiftLabel: { fontSize: 12, fontWeight: '800', color: ORANGE },
  shiftCount: { fontSize: 11, color: '#64748b' },
  flagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  flagWarning: { backgroundColor: '#f59e0b15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#f59e0b40' },
  flagWarningText: { fontSize: 10, fontWeight: '800', color: '#d97706' },
  flagGood: { backgroundColor: '#22c55e15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#22c55e40' },
  flagGoodText: { fontSize: 10, fontWeight: '800', color: '#16a34a' },
  attendanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  attText: { fontSize: 11, color: '#475569', width: '45%' },
})
