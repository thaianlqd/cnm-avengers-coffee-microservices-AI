import React, { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { colors, shadows } from '../theme'
import { statusLabels } from '../data/demo'
import { QRScannerModal } from './QRScannerModal'

export function DeliveryDetailModal({ visible, item, shipperId, onClose, onChanged }) {
  const [failureReason, setFailureReason] = useState('')
  const [qrScannerVisible, setQrScannerVisible] = useState(false)
  const [scannedQRData, setScannedQRData] = useState(null)
  const queryClient = useQueryClient()

  const detailMutation = useMutation({
    mutationFn: async ({ action, payload }) => {
      const urlMap = {
        confirm: `/shippers/${shipperId}/deliveries/${item?.id}/confirm-pickup`,
        start: `/shippers/${shipperId}/deliveries/${item?.id}/start`,
        complete: `/shippers/${shipperId}/deliveries/${item?.id}/complete`,
        fail: `/shippers/${shipperId}/deliveries/${item?.id}/fail`,
      }
      return apiClient.post(urlMap[action], payload || {})
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shipper-mobile'] })
      onChanged?.()
      onClose?.()
      setFailureReason('')
      Alert.alert('Thành công', 'Đã cập nhật trạng thái đơn hàng.')
    },
    onError: () => {
      Alert.alert('Không thể cập nhật', 'Đang dùng bản demo hoặc backend chưa trả lời. App vẫn giữ giao diện và luồng xử lý.')
    },
  })

  const actions = useMemo(() => {
    if (!item) return []
    if (item.status === 'PENDING') {
      return [{ label: 'Xác nhận lấy hàng', action: 'confirm', tone: 'primary' }]
    }
    if (item.status === 'CONFIRMED') {
      return [{ label: 'Bắt đầu giao hàng', action: 'start', tone: 'secondary' }]
    }
    if (item.status === 'IN_TRANSIT') {
      return [
        { label: '📱 Quét QR xác nhận', action: 'qr_scan', tone: 'info' },
        { label: 'Hoàn thành giao', action: 'complete', tone: 'success' },
        { label: 'Giao thất bại', action: 'fail', tone: 'danger' },
      ]
    }
    return []
  }, [item])

  const runAction = (action) => {
    if (!item) return

    // Handle QR scan action
    if (action === 'qr_scan') {
      setQrScannerVisible(true)
      return
    }

    if (action === 'fail') {
      if (!failureReason.trim()) {
        Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do giao thất bại.')
        return
      }
      detailMutation.mutate({ action, payload: { reason: failureReason } })
      return
    }

    const geoPayload = { latitude: 10.7758, longitude: 106.701 }
    if (scannedQRData && action === 'complete') {
      geoPayload.qr_data = scannedQRData
    }
    detailMutation.mutate({ action, payload: geoPayload })
  }

  const handleQRScanned = (qrData) => {
    setScannedQRData(qrData)
    setQrScannerVisible(false)
    Alert.alert(
      '✅ QR Quét Thành Công',
      `Dữ liệu QR: ${qrData}\n\nXác nhận hoàn thành giao hàng?`,
      [
        {
          text: 'Hủy',
          onPress: () => setScannedQRData(null),
        },
        {
          text: 'Xác nhận hoàn thành',
          onPress: () => {
            const geoPayload = { latitude: 10.7758, longitude: 106.701, qr_data: qrData }
            detailMutation.mutate({ action: 'complete', payload: geoPayload })
          },
        },
      ],
    )
  }

  if (!item) return null

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <LinearGradient colors={['#2f2119', '#f26b1d']} style={styles.header}>
              <Text style={styles.title}>Đơn {item.ma_don_hang}</Text>
              <Text style={styles.subtitle}>{statusLabels[item.status] || item.status}</Text>
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.infoCard}>
                <Text style={styles.sectionLabel}>Địa chỉ</Text>
                <Text style={styles.infoText}>{item.delivery_address}</Text>
              </View>

              <View style={styles.row}>
                <View style={styles.miniCard}>
                  <Text style={styles.sectionLabel}>Phí giao</Text>
                  <Text style={styles.miniValue}>{Number(item.delivery_fee || 0).toLocaleString('vi-VN')} đ</Text>
                </View>
                <View style={styles.miniCard}>
                  <Text style={styles.sectionLabel}>ETA</Text>
                  <Text style={styles.miniValue}>{item.estimated_time_minutes || 0} phút</Text>
                </View>
              </View>

              {item.delivery_note ? (
                <View style={[styles.infoCard, { backgroundColor: '#fff7ed' }]}>
                  <Text style={styles.sectionLabel}>Ghi chú</Text>
                  <Text style={styles.infoText}>{item.delivery_note}</Text>
                </View>
              ) : null}

              {scannedQRData ? (
                <View style={[styles.infoCard, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={styles.sectionLabel}>✅ QR Đã Quét</Text>
                  <Text style={[styles.infoText, { color: '#22c55e' }]}>{scannedQRData}</Text>
                </View>
              ) : null}

              {item.status === 'IN_TRANSIT' ? (
                <View style={styles.failureBox}>
                  <Text style={styles.sectionLabel}>Nếu giao thất bại</Text>
                  <TextInput
                    value={failureReason}
                    onChangeText={setFailureReason}
                    placeholder="Nhập lý do giao thất bại"
                    placeholderTextColor="#a17a62"
                    style={styles.input}
                    multiline
                  />
                </View>
              ) : null}

              <View style={styles.buttonGroup}>
                {actions.map((action) => (
                  <Pressable
                    key={action.label}
                    onPress={() => runAction(action.action)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      action.tone === 'secondary' && { backgroundColor: colors.secondary },
                      action.tone === 'success' && { backgroundColor: colors.success },
                      action.tone === 'danger' && { backgroundColor: colors.danger },
                      action.tone === 'info' && { backgroundColor: '#0ea5e9' },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={styles.actionText}>{action.label}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={onClose} style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.92 }]}>
                  <Text style={styles.cancelText}>Đóng</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <QRScannerModal visible={qrScannerVisible} onClose={() => setQrScannerVisible(false)} onQRScanned={handleQRScanned} />
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 14, 8, 0.56)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  header: {
    padding: 18,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.86)',
    marginTop: 2,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoText: {
    marginTop: 8,
    color: colors.coffee,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniValue: {
    color: colors.coffee,
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
  },
  failureBox: {
    backgroundColor: '#fff4f4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f7c1c1',
    padding: 14,
  },
  input: {
    marginTop: 8,
    borderRadius: 16,
    minHeight: 92,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d1d1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.coffee,
    textAlignVertical: 'top',
  },
  buttonGroup: {
    gap: 10,
    paddingBottom: 12,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  actionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: '#f1e4d6',
  },
  cancelText: {
    color: colors.coffee,
    fontSize: 15,
    fontWeight: '900',
  },
})
