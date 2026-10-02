import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatCurrency, formatDateTime } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

function getVnDateKey(input) {
  const source = input ? new Date(input) : new Date()
  const vn = new Date(source.getTime() + 7 * 60 * 60 * 1000)
  const y = vn.getUTCFullYear()
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0')
  const d = String(vn.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function taoKhoangTheoNgay(dateKey) {
  const from = new Date(`${dateKey}T07:00:00+07:00`).toISOString()
  const to = new Date(`${dateKey}T22:00:00+07:00`).toISOString()
  return { from, to }
}

function HistoryItem({ item, branchCode, onRefresh }) {
  const [editing, setEditing] = useState(false)
  const [draftOpen, setDraftOpen] = useState(String(item.cash_open || item.tien_dau_ca || 0))
  const [draftClose, setDraftClose] = useState(String(item.cash_close || item.tien_cuoi_ca || 0))
  const [draftNote, setDraftNote] = useState(item.note || item.ghi_chu || '')
  const [saving, setSaving] = useState(false)

  const isAppr = item.approval_status === 'APPROVED' || item.trang_thai_phe_duyet === 'APPROVED' || item.trang_thai === 'APPROVED'
  const isRej = item.approval_status === 'REJECTED' || item.trang_thai_phe_duyet === 'REJECTED' || item.trang_thai === 'REJECTED'
  const statusColor = isAppr ? colors.success : isRej ? colors.danger : colors.warning

  const shiftId = item.ma_ca || item.id || item.ma_bien_ban
  
  const handleDelete = () => {
    Alert.alert('Xác nhận', 'Xóa ca này? Không thể hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/staff/shifts/${shiftId}?branch_code=${encodeURIComponent(branchCode)}`)
            onRefresh()
          } catch (err) {
            Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Xóa ca thất bại')
          }
        }
      }
    ])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiClient.patch(`/staff/shifts/${shiftId}`, {
        cash_open: Number(draftOpen || 0),
        cash_close: Number(draftClose || 0),
        note: draftNote,
        branch_code: branchCode
      })
      setEditing(false)
      onRefresh()
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Sửa ca thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.historyCard, shadows.sm]}>
      <View style={styles.historyTop}>
        <Text style={styles.historyId}>#{String(shiftId || '').slice(0, 8).toUpperCase()}</Text>
        <View style={[styles.historyBadge, { backgroundColor: statusColor + '15' }]}>
          <Text style={[styles.historyBadgeText, { color: statusColor }]}>
            {isAppr ? 'Đã duyệt' : isRej ? 'Từ chối' : 'Chờ duyệt'}
          </Text>
        </View>
      </View>
      
      {editing ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <View>
            <Text style={styles.historyLabel}>Tiền đầu ca</Text>
            <TextInput style={[styles.input, { height: 36, marginTop: 4 }]} keyboardType="numeric" value={draftOpen} onChangeText={setDraftOpen} />
          </View>
          <View>
            <Text style={styles.historyLabel}>Tiền cuối ca</Text>
            <TextInput style={[styles.input, { height: 36, marginTop: 4 }]} keyboardType="numeric" value={draftClose} onChangeText={setDraftClose} />
          </View>
          <View>
            <Text style={styles.historyLabel}>Ghi chú</Text>
            <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top', marginTop: 4 }]} multiline value={draftNote} onChangeText={setDraftNote} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable style={[styles.rejectBtn, { flex: 1, height: 36, paddingVertical: 0 }]} onPress={() => setEditing(false)}>
              <Text style={styles.rejectBtnText}>Hủy</Text>
            </Pressable>
            <Pressable style={[styles.approveBtn, { flex: 1, height: 36, paddingVertical: 0 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveBtnText}>Lưu</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Nhân viên</Text>
            <Text style={styles.historyValue}>{item.staff_name || item.ten_nhan_vien || '—'}</Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Ngày ca</Text>
            <Text style={styles.historyValue}>{item.shift_date || item.ngay_chot_ca || '—'}</Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Tiền cuối ca</Text>
            <Text style={styles.historyValue}>{formatCurrency(item.cash_close || item.tien_cuoi_ca || 0)}</Text>
          </View>
          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Doanh thu</Text>
            <Text style={[styles.historyValue, { color: colors.primary }]}>{formatCurrency(item.doanh_thu_thuc || item.tong_doanh_thu || 0)}</Text>
          </View>
          {item.note || item.ghi_chu ? (
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>📝 {item.note || item.ghi_chu}</Text>
          ) : null}
          <Text style={styles.historyDate}>{formatDateTime(item.ngay_tao || item.created_at)}</Text>
          
          {!isAppr ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable style={styles.actionBtnOutline} onPress={() => setEditing(true)}>
                <Ionicons name="pencil" size={14} color={colors.primary} />
                <Text style={styles.actionBtnOutlineText}>Sửa</Text>
              </Pressable>
              <Pressable style={[styles.actionBtnOutline, { borderColor: colors.danger }]} onPress={handleDelete}>
                <Ionicons name="trash" size={14} color={colors.danger} />
                <Text style={[styles.actionBtnOutlineText, { color: colors.danger }]}>Xóa</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

export function ShiftsScreen() {
  const { sessionBranchCode, sessionUsername, sessionRole } = useAdmin()
  const [shiftDate, setShiftDate] = useState(() => getVnDateKey())
  const [cashOpen, setCashOpen] = useState('1000000')
  const [cashClose, setCashClose] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState({ preview: false, close: false, history: false })
  const [status, setStatus] = useState({ error: '', success: '' })
  const [approvals, setApprovals] = useState([]) // manager only
  const [approvingId, setApprovingId] = useState('')
  const [approvalNotes, setApprovalNotes] = useState({})
  const [activeTab, setActiveTab] = useState('close')

  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
  const isManager = sessionRole === 'MANAGER' || sessionRole === 'ADMIN'

  const loadPreview = useCallback(async () => {
    setLoading((p) => ({ ...p, preview: true }))
    setStatus({ error: '', success: '' })
    try {
      const { from, to } = taoKhoangTheoNgay(shiftDate)
      const params = new URLSearchParams({
        shift_date: shiftDate,
        from,
        to,
        cash_open: cashOpen || '0',
        cash_close: cashClose || '0',
        branch_code: branchCode,
      })
      const response = await apiClient.get(`/staff/shifts/preview?${params.toString()}`)
      setPreview(response)
    } catch (err) {
      setStatus({ error: err?.response?.data?.message || err?.message || 'Không tải được preview', success: '' })
    } finally {
      setLoading((p) => ({ ...p, preview: false }))
    }
  }, [shiftDate, cashOpen, cashClose, branchCode])

  const loadHistory = useCallback(async () => {
    setLoading((p) => ({ ...p, history: true }))
    try {
      const response = await apiClient.get(`/staff/shifts/history?limit=50&branch_code=${encodeURIComponent(branchCode)}`)
      setHistory(response?.items || (Array.isArray(response) ? response : []))
    } catch {
      setHistory([])
    } finally {
      setLoading((p) => ({ ...p, history: false }))
    }
  }, [branchCode])

  const loadApprovals = useCallback(async () => {
    if (!isManager) return
    try {
      const response = await apiClient.get(`/staff/shifts/history?limit=100&branch_code=${encodeURIComponent(branchCode)}`)
      const arr = response?.items || (Array.isArray(response) ? response : [])
      setApprovals(arr)
    } catch {
      setApprovals([])
    }
  }, [branchCode, isManager])

  useEffect(() => {
    loadPreview()
    loadHistory()
    if (isManager) loadApprovals()
  }, [loadPreview, loadHistory, loadApprovals])

  const handleCloseShift = async () => {
    if (!cashClose.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiền mặt cuối ca.')
      return
    }
    setLoading((p) => ({ ...p, close: true }))
    setStatus({ error: '', success: '' })
    try {
      const { from, to } = taoKhoangTheoNgay(shiftDate)
      await apiClient.post('/staff/shifts/close', {
        shift_date: shiftDate,
        from,
        to,
        cash_open: Number(cashOpen || 0),
        cash_close: Number(cashClose || 0),
        note: note.trim() || undefined,
        staff_name: sessionUsername || 'staff',
        branch_code: branchCode,
      })
      setStatus({ error: '', success: 'Chốt ca thành công, đã lưu biên bản đối soát.' })
      await loadHistory()
      await loadPreview()
    } catch (err) {
      setStatus({ error: err?.response?.data?.message || err?.message || 'Chốt ca thất bại', success: '' })
    } finally {
      setLoading((p) => ({ ...p, close: false }))
    }
  }

  const handleApproval = async (shiftId, approved) => {
    setApprovingId(shiftId)
    try {
      await apiClient.patch(`/manager/shifts/${shiftId}/approval`, {
        status: approved ? 'APPROVED' : 'REJECTED',
        manager_name: sessionUsername || 'manager',
        approval_note: approvalNotes[shiftId] || '',
        branch_code: branchCode,
      })
      await loadApprovals()
      await loadHistory()
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Không thể xử lý')
    } finally {
      setApprovingId('')
    }
  }

  const TABS = [
    { key: 'close', label: '📋 Chốt ca' },
    { key: 'history', label: '🕐 Lịch sử' },
    ...(isManager ? [{ key: 'approval', label: `✅ Duyệt (${approvals.length})` }] : []),
  ]

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Chốt ca</Text>
        <Text style={styles.pageSubtitle}>Đối soát tiền mặt và lịch sử ca làm</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'close' ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, shadows.sm]}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ngày chốt ca</Text>
              <TextInput
                value={shiftDate}
                onChangeText={(v) => setShiftDate(v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </View>

            <View style={styles.cashRow}>
              <View style={[styles.section, { flex: 1 }]}>
                <Text style={styles.sectionLabel}>Tiền đầu ca (đ)</Text>
                <TextInput
                  value={cashOpen}
                  onChangeText={setCashOpen}
                  keyboardType="numeric"
                  placeholder="1000000"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
              <View style={[styles.section, { flex: 1 }]}>
                <Text style={styles.sectionLabel}>Tiền cuối ca (đ) *</Text>
                <TextInput
                  value={cashClose}
                  onChangeText={setCashClose}
                  keyboardType="numeric"
                  placeholder="Nhập số tiền"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ghi chú</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Ghi chú ca làm..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[styles.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
              />
            </View>
          </View>

          <Pressable onPress={loadPreview} disabled={loading.preview} style={styles.previewBtn}>
            {loading.preview ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="eye-outline" size={16} color={colors.primary} />}
            <Text style={styles.previewBtnText}>Xem trước đối soát</Text>
          </Pressable>

          {preview ? (
            <View style={[styles.previewCard, shadows.sm]}>
              <Text style={styles.previewTitle}>Kết quả đối soát ca</Text>
              {[
                { label: 'Tổng đơn', value: `${preview?.system?.total_orders || 0} đơn` },
                { label: 'Doanh thu thực', value: formatCurrency(preview?.system?.total_revenue || 0) },
                { label: 'Tiền mặt thu', value: formatCurrency(preview?.system?.cash_in_gross || 0) },
                { label: 'Tiền thối khách', value: formatCurrency(preview?.system?.cash_change_out || 0) },
                { label: 'Tiền mặt thực thu', value: formatCurrency(preview?.system?.cash_revenue || 0) },
                { label: 'Kỳ vọng cuối ca', value: formatCurrency(preview?.reconciliation?.expected_cash_close || 0) },
                { 
                  label: 'Chênh lệch', 
                  value: `${(preview?.reconciliation?.difference || 0) >= 0 ? '+' : ''}${formatCurrency(preview?.reconciliation?.difference || 0)}`, 
                  highlight: true 
                },
              ].map(({ label, value, highlight }) => (
                <View key={label} style={styles.previewRow}>
                  <Text style={styles.previewLabel}>{label}</Text>
                  <Text style={[styles.previewValue, highlight && { color: colors.primary }]}>{value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {status.error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{status.error}</Text>
            </View>
          ) : null}
          {status.success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={styles.successText}>{status.success}</Text>
            </View>
          ) : null}

          <Pressable onPress={handleCloseShift} disabled={loading.close} style={[styles.closeShiftBtn, loading.close && { opacity: 0.6 }]}>
            {loading.close ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-done-outline" size={20} color="#fff" />}
            <Text style={styles.closeShiftText}>
              {loading.close ? 'Đang chốt ca...' : 'Chốt ca tiền mặt'}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {activeTab === 'history' ? (
        <FlatList
          data={history}
          keyExtractor={(item, idx) => String(item.ma_ca || item.id || item.ma_bien_ban || idx)}
          renderItem={({ item }) => (
            <HistoryItem item={item} branchCode={branchCode} onRefresh={loadHistory} />
          )}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading.history ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="time-outline" size={44} color={colors.border} />
                <Text style={styles.emptyText}>Chưa có lịch sử chốt ca</Text>
              </View>
            )
          }
          onRefresh={loadHistory}
          refreshing={loading.history}
        />
      ) : null}

      {activeTab === 'approval' && isManager ? (
        <FlatList
          data={approvals}
          keyExtractor={(item, idx) => String(item.ma_ca || item.id || item.ma_bien_ban || idx)}
          renderItem={({ item }) => {
            const shiftId = String(item.ma_ca || item.id || item.ma_bien_ban)
            const isApproving = approvingId === shiftId
            const isAppr = item.approval_status === 'APPROVED' || item.trang_thai_phe_duyet === 'APPROVED' || item.trang_thai === 'APPROVED'
            const isRej = item.approval_status === 'REJECTED' || item.trang_thai_phe_duyet === 'REJECTED' || item.trang_thai === 'REJECTED'
            const statusColor = isAppr ? colors.success : isRej ? colors.danger : colors.warning
            return (
              <View style={[styles.approvalCard, shadows.sm]}>
                <View style={styles.historyTop}>
                  <Text style={styles.approvalId}>Biên bản #{shiftId.slice(0, 8).toUpperCase()}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: statusColor + '15' }]}>
                    <Text style={[styles.historyBadgeText, { color: statusColor }]}>
                      {isAppr ? 'Đã duyệt' : isRej ? 'Từ chối' : 'Chờ duyệt'}
                    </Text>
                  </View>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>Nhân viên</Text>
                  <Text style={styles.historyValue}>{item.staff_name || item.ten_nhan_vien || '—'}</Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>Ngày</Text>
                  <Text style={styles.historyValue}>{item.shift_date || item.ngay_chot_ca || '—'}</Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>Tiền cuối ca</Text>
                  <Text style={styles.historyValue}>{formatCurrency(item.cash_close || 0)}</Text>
                </View>
                <View style={styles.historyRow}>
                  <Text style={styles.historyLabel}>Doanh thu</Text>
                  <Text style={[styles.historyValue, { color: colors.primary }]}>{formatCurrency(item.doanh_thu_thuc || 0)}</Text>
                </View>
                
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.historyLabel}>Ghi chú phê duyệt</Text>
                  <TextInput
                    style={[styles.input, { height: 40, marginTop: 4, fontSize: 13 }]}
                    placeholder="Nhập ghi chú nếu cần..."
                    placeholderTextColor={colors.placeholder}
                    value={approvalNotes[shiftId] !== undefined ? approvalNotes[shiftId] : (item.ghi_chu_phe_duyet || '')}
                    onChangeText={(val) => setApprovalNotes((p) => ({ ...p, [shiftId]: val }))}
                  />
                </View>

                <View style={styles.approvalActions}>
                  <Pressable
                    disabled={isApproving}
                    onPress={() => handleApproval(shiftId, false)}
                    style={styles.rejectBtn}
                  >
                    {isApproving ? <ActivityIndicator size="small" color={colors.danger} /> : null}
                    <Text style={styles.rejectBtnText}>Từ chối</Text>
                  </Pressable>
                  <Pressable
                    disabled={isApproving}
                    onPress={() => handleApproval(shiftId, true)}
                    style={styles.approveBtn}
                  >
                    {isApproving ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Text style={styles.approveBtnText}>Phê duyệt</Text>
                  </Pressable>
                </View>
              </View>
            )
          }}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Không có biên bản chờ duyệt</Text>
            </View>
          }
          onRefresh={loadApprovals}
          refreshing={false}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerTitleContainer: { marginBottom: spacing.sm, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: 8,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.primaryDark },
  body: { flex: 1 },
  bodyPad: { paddingHorizontal: spacing.lg, gap: 16, paddingBottom: 100 },
  card: { backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, gap: 14, borderWidth: 1, borderColor: colors.borderLight },
  section: { gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cashRow: { flexDirection: 'row', gap: 12 },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  previewBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  previewTitle: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 12 },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  previewLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  previewValue: { fontSize: 14, color: colors.text, fontWeight: '800' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: 10 },
  errorText: { flex: 1, fontSize: 13, color: colors.danger },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.successBg, borderRadius: radius.sm, padding: 10 },
  successText: { flex: 1, fontSize: 13, color: colors.success },
  closeShiftBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  closeShiftText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  listPad: { paddingHorizontal: spacing.lg, gap: 12, paddingBottom: 100 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: colors.muted },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8,
  },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyId: { fontSize: 14, fontWeight: '900', color: colors.text },
  historyBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  historyBadgeText: { fontSize: 10, fontWeight: '900' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  historyValue: { fontSize: 13, color: colors.text, fontWeight: '700' },
  historyDate: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  approvalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8,
  },
  approvalId: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 4 },
  approvalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '800', color: colors.danger },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 10,
    backgroundColor: colors.success,
  },
  approveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  actionBtnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  actionBtnOutlineText: { fontSize: 12, fontWeight: '700', color: colors.primary },
})