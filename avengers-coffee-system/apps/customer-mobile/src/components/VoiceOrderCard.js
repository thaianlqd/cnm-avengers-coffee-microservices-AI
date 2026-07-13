/**
 * VoiceOrderCard.js
 * Hiển thị trong chat bubble khi AI detect được order intent từ giọng nói/text.
 * Props:
 *   transcript  - string: câu user đã nói (từ Whisper)
 *   items       - array: sản phẩm matched từ DB
 *   total       - number: tổng tiền
 *   message     - string: message từ AI
 *   onConfirm   - () => void: user bấm "Đặt ngay"
 *   onDismiss   - () => void: user bấm "Bỏ qua"
 *   loading     - bool: đang tạo đơn
 */
import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, radius, shadows } from '../theme'

function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + 'đ'
}

export default function VoiceOrderCard({
  transcript,
  items = [],
  total = 0,
  message,
  onConfirm,
  onDismiss,
  loading = false,
}) {
  const matchedItems = items.filter((i) => i.matched)
  const unmatchedItems = items.filter((i) => !i.matched)

  return (
    <View style={styles.card}>
      {/* Header */}
      <LinearGradient
        colors={['#f26b1d', '#d4560e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <Ionicons name="mic" size={16} color="#fff" />
        <Text style={styles.headerText}>Đặt hàng bằng giọng nói</Text>
      </LinearGradient>

      {/* Transcript */}
      {Boolean(transcript) && (
        <View style={styles.transcriptRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.muted} />
          <Text style={styles.transcriptText} numberOfLines={2}>
            "{transcript}"
          </Text>
        </View>
      )}

      {/* AI message */}
      {Boolean(message) && (
        <Text style={styles.message}>{message}</Text>
      )}

      {/* Items */}
      {matchedItems.length > 0 && (
        <View style={styles.itemsSection}>
          {matchedItems.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={styles.itemQtyBadge}>
                <Text style={styles.itemQtyText}>x{item.quantity}</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                {item.note ? (
                  <Text style={styles.itemNote}>{item.note}</Text>
                ) : null}
                {item.size ? (
                  <Text style={styles.itemNote}>Size {item.size}</Text>
                ) : null}
              </View>
              <Text style={styles.itemPrice}>{formatCurrency(item.subtotal)}</Text>
            </View>
          ))}

          {/* Unmatched items warning */}
          {unmatchedItems.map((item, idx) => (
            <View key={`u-${idx}`} style={styles.unmatchedRow}>
              <Ionicons name="alert-circle-outline" size={13} color="#f59e0b" />
              <Text style={styles.unmatchedText}>
                Không tìm thấy "{item.requested_name}" trong menu
              </Text>
            </View>
          ))}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tổng cộng</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismissBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="close" size={15} color={colors.muted} />
          <Text style={styles.dismissText}>Bỏ qua</Text>
        </Pressable>

        {matchedItems.length > 0 && (
          <Pressable
            onPress={onConfirm}
            disabled={loading}
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={['#f26b1d', '#d4560e']}
              style={styles.confirmBtnGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="cart" size={15} color="#fff" />
                  <Text style={styles.confirmText}>Đặt ngay</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: '#f26b1d30',
    overflow: 'hidden',
    maxWidth: '90%',
    alignSelf: 'flex-start',
    ...shadows.md,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  transcriptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  transcriptText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  message: {
    fontSize: 13,
    color: colors.text,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 2,
    lineHeight: 19,
    fontWeight: '600',
  },
  itemsSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQtyBadge: {
    backgroundColor: '#fff4ec',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f26b1d40',
  },
  itemQtyText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  itemNote: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  unmatchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  unmatchedText: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600',
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f5ede6',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f5ede6',
    justifyContent: 'flex-end',
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
  },
  dismissText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  confirmBtn: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  confirmBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '900',
  },
})
