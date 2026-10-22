import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Image, Linking } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import apiClient from '../lib/apiClient'
import { pollQrPaymentStatus, paymentCardRows } from '../../../web-customer/src/components/chat/chatWidgetActions'
import { pollWalletTopup, refreshWalletTopupOffer, latestWalletTopupOffer } from '../../../web-customer/src/components/wallet/walletTopup'
import { colors } from '../theme'

const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ'
const box = { marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', gap: 8 }
function Action({ label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 11, borderRadius: 9, backgroundColor: disabled ? '#f1f1f1' : colors.primary }}><Text style={{ color: disabled ? '#888' : '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{label}</Text></Pressable>
}
export function CheckoutCard({ pending, busy, onConfirm }) {
  if (!pending) return null
  return <View style={box}><Text style={{ fontWeight: '700' }}>Xác nhận đơn hàng</Text>{pending.items.map((item, i) => <Text key={i}>{item.quantity} × {item.product_name}{item.size ? ` · ${item.size}` : ''}{item.note ? ` · ${item.note}` : ''}</Text>)}<Text>{pending.branch_name}</Text><Text>Tổng: {money(pending.total)}</Text><Action label={busy ? 'Đang xác nhận…' : 'Xác nhận đặt hàng'} disabled={busy} onPress={onConfirm} /></View>
}
export default function ChatActions({ message, chat, onReply, onLogin }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending'), [error, setError] = useState('')
  const qr = message.qrPayment, topup = message._walletTopup
  const resolved = chat.messages.some(m => qr && m.qrResolved === qr.orderId || topup && m._walletTopupResolved === topup.transactionId)
  const failed = chat.messages.some(m => qr && m.qrFailed === qr.orderId || topup && m._walletTopupFailed === topup.transactionId)
  const currentOffer = latestWalletTopupOffer(chat.messages, topup?.userId || message._walletTopupOffer?.userId)
  const isCurrentOffer = currentOffer === message._walletTopupOffer
  useEffect(() => {
    if ((!qr && !topup) || resolved || failed || status !== 'pending') return
    let alive = true, running = false
    const check = async () => {
      if (running) return
      running = true
      try {
        const result = qr ? { status: await pollQrPaymentStatus(apiClient, qr.userId, qr.orderId) }
          : await pollWalletTopup(apiClient, topup, topup.userId)
        if (!alive) return
        setError('')
        if (result.status === 'paid') {
          setStatus('paid')
          await queryClient.invalidateQueries({ queryKey: ['userWallet'] })
          await queryClient.invalidateQueries({ queryKey: ['customer', 'orders'] })
          const offer = topup ? refreshWalletTopupOffer(currentOffer, result.balance) : null
          await chat.controller.resolvePayment(qr ? { qrResolved: qr.orderId } : { _walletTopupResolved: topup.transactionId, _walletTopupOffer: offer }, qr ? 'Thanh toán QR đã được hệ thống xác nhận.' : `Nạp ví thành công. Số dư: **${money(result.balance)}**. Bạn có thể tiếp tục chọn Ví Avengers để thanh toán.`)
        } else if (['failed', 'expired', 'review'].includes(result.status)) {
          setStatus(result.status)
          await chat.controller.resolvePayment(qr ? { qrFailed: qr.orderId } : { _walletTopupFailed: topup.transactionId, _walletTopupResolved: topup.transactionId }, result.status === 'review' ? 'Giao dịch cần đối soát. Vui lòng liên hệ cửa hàng.' : 'Giao dịch chưa thành công hoặc đã hết hạn.')
        }
      } catch { if (alive) setError('Chưa kiểm tra được giao dịch. Hệ thống sẽ thử lại.') }
      finally { running = false }
    }
    check()
    const timer = globalThis.setInterval(check, 5000)
    return () => { alive = false; globalThis.clearInterval(timer) }
  }, [qr, topup, resolved, failed, status, chat.controller, queryClient, currentOffer])
  const open = async url => {
    try { if (!/^https?:\/\//i.test(url || '')) throw new Error(); await Linking.openURL(url) }
    catch { setError('Chưa mở được trang thanh toán. Bạn hãy thử lại.') }
  }
  return <View style={{ gap: 6 }}>
    {!!message.paymentOptions?.length && <View style={box}><Text style={{ fontWeight: '700' }}>Phương thức thanh toán</Text>{paymentCardRows(message.paymentOptions).map(row => <View key={row.name}><Text style={{ marginBottom: 5 }}>{row.desc}</Text><Action label={row.name} disabled={chat.busy || row.enabled === false} onPress={() => onReply(row.text)} /></View>)}</View>}
    {message.loginAction && <View style={box}><Action label={message.loginAction.label || 'Đăng nhập để tiếp tục'} onPress={onLogin} /></View>}
    {message._walletTopupOffer && isCurrentOffer && <View style={box}><Text>Số dư: {money(message._walletTopupOffer.balance)} · Còn thiếu: {money(message._walletTopupOffer.shortfall)}</Text>{(message._walletTopupOffer.suggested_amounts || []).map(amount => <Action key={amount} label={`Nạp ${money(amount)}`} disabled={chat.busy} onPress={() => onReply(`Nạp ${amount}đ`)} />)}</View>}
    {qr && <View style={box}><Text style={{ fontWeight: '700' }}>Thanh toán QR · {money(qr.amount)}</Text><Text>Mã tham chiếu: {qr.reference || qr.orderId}</Text>{!resolved && !failed && <>{qr.qrImgUrl && <Image accessibilityLabel="Mã QR thanh toán đơn hàng" source={{ uri: qr.qrImgUrl }} style={{ width: 200, height: 200, alignSelf: 'center' }} resizeMode="contain" />}{qr.qrFallbackUrl && <Action label="Mở mã QR" onPress={() => open(qr.qrFallbackUrl)} />}</>}<Text>{resolved ? 'Đã thanh toán' : failed ? 'Chưa thành công / cần đối soát' : 'Đang chờ hệ thống xác nhận chuyển khoản…'}</Text></View>}
    {topup && <View style={box}><Text>Nạp ví {money(topup.amount)}</Text>{!resolved && !failed && <Action label="Mở trang nạp ví" onPress={() => open(topup.url)} />}<Text>{resolved ? 'Giao dịch đã được kiểm tra' : 'Đang chờ ngân hàng xác nhận…'}</Text></View>}
    {message.paymentUrl && <View style={box}><Action label="Tiếp tục thanh toán VNPAY" onPress={() => open(message.paymentUrl)} /></View>}
    {!!error && <Text style={{ color: colors.primary, fontSize: 12 }}>{error}</Text>}
  </View>
}
