import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'

const DAYS_OF_WEEK = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const SHIFT_LABELS = { MORNING: 'Ca Sáng', AFTERNOON: 'Ca Chiều', EVENING: 'Ca Tối' }
const SHIFT_COLORS = {
  MORNING: { bg: '#FFF3E0', text: '#E65100', icon: 'sunny-outline' },
  AFTERNOON: { bg: '#E3F2FD', text: '#1565C0', icon: 'partly-sunny-outline' },
  EVENING: { bg: '#EDE7F6', text: '#4527A0', icon: 'moon-outline' },
}
const STATUS_LABEL = { SCHEDULED: 'Đã lên lịch', WORKING: 'Đang làm', COMPLETED: 'Đã hoàn thành', ABSENT: 'Vắng mặt' }
const STATUS_COLORS = {
  SCHEDULED: colors.info,
  WORKING: colors.success,
  COMPLETED: colors.primary,
  ABSENT: colors.danger,
}

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function formatDateVN(date) {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
}

function formatTime(dateStr) {
  if (!dateStr) return '--:--'
  const d = new Date(dateStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ScheduleScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const weekDates = getWeekDates(weekOffset)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['shipper-schedule', shipper?.id],
    queryFn: () => apiClient.get(`/shippers/${shipper.id}/schedule`),
    enabled: !!shipper?.id,
    select: (res) => res || [],
  })

  const checkInMutation = useMutation({
    mutationFn: (scheduleId) =>
      apiClient.post(`/shippers/${shipper.id}/schedule/${scheduleId}/checkin`),
    onSuccess: () => {
      queryClient.invalidateQueries(['shipper-schedule', shipper?.id])
      Alert.alert('✅ Check-in thành công!', 'Bắt đầu ca làm việc.')
    },
    onError: (err) => Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể check-in'),
  })

  const checkOutMutation = useMutation({
    mutationFn: (scheduleId) =>
      apiClient.post(`/shippers/${shipper.id}/schedule/${scheduleId}/checkout`),
    onSuccess: () => {
      queryClient.invalidateQueries(['shipper-schedule', shipper?.id])
      Alert.alert('✅ Check-out thành công!', 'Kết thúc ca làm việc.')
    },
    onError: (err) => Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể check-out'),
  })

  const selectedDaySchedules = schedules.filter((s) => {
    if (!s.work_date) return false
    return isSameDay(new Date(s.work_date), selectedDate)
  })

  const renderWeekStrip = () => (
    <View style={styles.weekStrip}>
      <TouchableOpacity onPress={() => setWeekOffset((p) => p - 1)} style={styles.weekArrow}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.weekDays}>
        {weekDates.map((date, idx) => {
          const isToday = isSameDay(date, new Date())
          const isSelected = isSameDay(date, selectedDate)
          const hasSchedule = schedules.some((s) => s.work_date && isSameDay(new Date(s.work_date), date))
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.dayCell, isSelected && styles.dayCellSelected]}
              onPress={() => setSelectedDate(date)}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{DAYS_OF_WEEK[date.getDay()]}</Text>
              <Text style={[styles.dateNum, isSelected && styles.dateNumSelected, isToday && styles.dateNumToday]}>
                {date.getDate()}
              </Text>
              {hasSchedule && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
            </TouchableOpacity>
          )
        })}
      </View>
      <TouchableOpacity onPress={() => setWeekOffset((p) => p + 1)} style={styles.weekArrow}>
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  )

  const renderScheduleCard = (item) => {
    const shiftMeta = SHIFT_COLORS[item.shift_name] || SHIFT_COLORS.MORNING
    const statusColor = STATUS_COLORS[item.status] || colors.muted
    const canCheckIn = item.status === 'SCHEDULED'
    const canCheckOut = item.status === 'WORKING'

    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.shiftBadge, { backgroundColor: shiftMeta.bg }]}>
            <Ionicons name={shiftMeta.icon} size={16} color={shiftMeta.text} />
            <Text style={[styles.shiftLabel, { color: shiftMeta.text }]}>
              {SHIFT_LABELS[item.shift_name] || item.shift_name}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusLabel, { color: statusColor }]}>{STATUS_LABEL[item.status] || item.status}</Text>
          </View>
        </View>

        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>Check-in</Text>
            <Text style={styles.timeValue}>{formatTime(item.check_in_time)}</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.muted} />
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>Check-out</Text>
            <Text style={styles.timeValue}>{formatTime(item.check_out_time)}</Text>
          </View>
        </View>

        {(canCheckIn || canCheckOut) && (
          <View style={styles.actionRow}>
            {canCheckIn && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.success }]}
                onPress={() => checkInMutation.mutate(item.id)}
                disabled={checkInMutation.isPending}
              >
                {checkInMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Check-in</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {canCheckOut && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                onPress={() => checkOutMutation.mutate(item.id)}
                disabled={checkOutMutation.isPending}
              >
                {checkOutMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Check-out</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Lịch làm việc</Text>
          <Text style={styles.headerSub}>{formatDateVN(selectedDate)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {renderWeekStrip()}

      <ScrollView contentContainerStyle={styles.body}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
        ) : selectedDaySchedules.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color={colors.muted} />
            <Text style={styles.emptyTitle}>Không có ca làm việc</Text>
            <Text style={styles.emptyDesc}>Ngày này bạn chưa được xếp ca. Liên hệ Quản lý để được cập nhật.</Text>
          </View>
        ) : (
          selectedDaySchedules.map(renderScheduleCard)
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.xs,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { ...typography.h4, color: colors.text },
  headerSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    ...shadows.xs,
  },
  weekArrow: { padding: spacing.sm },
  weekDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  dayCell: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: radius.md,
    minWidth: 36,
  },
  dayCellSelected: { backgroundColor: colors.primary },
  dayLabel: { ...typography.caption, color: colors.muted, marginBottom: 4 },
  dayLabelSelected: { color: colors.surface },
  dateNum: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  dateNumSelected: { color: colors.surface },
  dateNumToday: { color: colors.primary },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 3 },
  dotSelected: { backgroundColor: colors.surface },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  shiftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  shiftLabel: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusLabel: { fontSize: 12, fontWeight: 'bold' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  timeBlock: { alignItems: 'center' },
  timeLabel: { ...typography.caption, color: colors.muted },
  timeValue: { ...typography.h3, color: colors.text, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: 6,
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyTitle: { ...typography.h4, color: colors.textSecondary, marginTop: spacing.md },
  emptyDesc: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl },
})
