import TextInput from './TextInput'
import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView,  Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import Modal from './AppModal'
import { useCart } from '../hooks/useCart'
import { useFeedback, errorMessage } from '../context/FeedbackContext'
import api from '../lib/apiClient'
import { formatCurrency, safeArray } from '../lib/customerData'
import { colors } from '../theme'
export default function OrderActionsSheet({ orderId, userId, action, onClose, onCart }) {
  const cart = useCart(), client = useQueryClient(), notify = useFeedback()
  const [form, setForm] = useState(null), [preview, setPreview] = useState(null), [error, setError] = useState('')
  const details = useQuery({ queryKey: ['customer', 'order-action', userId, orderId, action], queryFn: () => action === 'reorder' ? api.post(`/customers/${userId}/orders/${orderId}/reorder-preview`) : api.get(`/customers/${userId}/orders/${orderId}`), enabled: Boolean(orderId && userId), staleTime: 0, retry: false })
  useEffect(() => {
    if (details.data?.order) setForm({ dia_chi_giao_hang: details.data.order.dia_chi_giao_hang || '', khung_gio_giao: details.data.order.khung_gio_giao || '', ghi_chu: details.data.order.ghi_chu || '', items: safeArray(details.data.order.chi_tiet).map(i => ({ ...i })) })
    setPreview(null); setError('')
  }, [details.data])
  const change = patch => { setForm(f => ({ ...f, ...patch })); setPreview(null); setError('') }
  const save = useMutation({ mutationFn: async () => {
    if (action === 'reorder') return cart.reorder(orderId, { expected_revision: details.data.revision, expected_subtotal: details.data.subtotal, expected_cart_version: cart.data?.cart_version })
    if (!form?.items.some(i => i.so_luong > 0)) throw new Error('Đơn phải còn ít nhất một món.')
    const payload = { ...form, items: form.items.filter(i => i.so_luong > 0).map(i => ({ id: Number(i.id), so_luong: Number(i.so_luong) })) }
    if (!preview) { const next = await api.patch(`/customers/${userId}/orders/${orderId}`, { ...payload, preview_only: true }); setPreview(next); return { previewOnly: true } }
    return api.patch(`/customers/${userId}/orders/${orderId}`, { ...payload, expected_revision: preview.revision, expected_total: preview.final_total })
  }, onSuccess: async data => {
    if (data.previewOnly) return
    await client.invalidateQueries({ queryKey: ['customer', 'orders', userId] }); client.invalidateQueries({ queryKey: ['userWallet', userId] }); client.invalidateQueries({ queryKey: ['customer', 'notifications', userId] })
    onClose(); notify(action === 'reorder' ? 'Đã thêm các món vào giỏ. Kiểm tra cách nhận món trước khi đặt.' : 'Đã cập nhật đơn hàng')
    if (action === 'reorder') onCart()
  }, onError: e => { setPreview(null); setError(errorMessage(e)) } })
  const items = action === 'reorder' ? details.data?.items || [] : form?.items || []
  const allowed = action === 'reorder' || details.data?.update_policy?.allowed
  return <Modal visible={Boolean(orderId)} transparent onRequestClose={() => !save.isPending && onClose()}><View style={{ flex: 1, justifyContent: 'flex-end' }}><View style={styles.sheet}>
    <View style={styles.header}><Text style={styles.title}>{action === 'reorder' ? 'Đặt lại vào giỏ' : 'Sửa đơn hàng'}</Text><Pressable disabled={save.isPending} onPress={onClose} accessibilityLabel="Đóng"><Ionicons name="close" size={24} /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {details.isPending ? <ActivityIndicator color={colors.primary} /> : details.isError ? <><Text style={styles.error}>{errorMessage(details.error)}</Text><Pressable onPress={() => details.refetch()}><Text>Thử lại</Text></Pressable></> : <>
        {!allowed && <Text style={styles.error}>{details.data?.update_policy?.reason}</Text>}
        {items.map((i, index) => <View key={i.id || index} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.name}>{i.ten_san_pham}</Text><Text style={styles.meta}>{[i.kich_co || i.size, ...(i.toppings || []), i.luong_da, i.do_ngot, i.loai_sua].filter(Boolean).join(' · ')}</Text><Text style={styles.meta}>{i.ghi_chu}</Text><Text>{formatCurrency(i.gia_ban * i.so_luong)}</Text></View>
          {action === 'edit' && allowed ? <View style={styles.quantity}><Pressable disabled={save.isPending} onPress={() => change({ items: items.map((line, idx) => idx === index ? { ...line, so_luong: Math.max(0, line.so_luong - 1) } : line) })}><Ionicons name="remove" size={20} /></Pressable><Text>{i.so_luong}</Text><Pressable disabled={save.isPending} onPress={() => change({ items: items.map((line, idx) => idx === index ? { ...line, so_luong: line.so_luong + 1 } : line) })}><Ionicons name="add" size={20} /></Pressable></View> : <Text>×{i.so_luong}</Text>}
        </View>)}
        {action === 'reorder' ? <><Text style={styles.name}>Giá món hiện tại: {formatCurrency(details.data?.subtotal)}</Text><Text style={styles.meta}>Các món được thêm vào giỏ hiện tại và giữ lựa chọn. Phí giao hàng, voucher sẽ tính tại giỏ. Chưa tạo đơn hàng mới.</Text></> : form && allowed && <>
          <Text style={styles.name}>Địa chỉ nhận món</Text><TextInput editable={!save.isPending} style={styles.input} value={form.dia_chi_giao_hang} onChangeText={v => change({ dia_chi_giao_hang: v })} multiline />
          <Text style={styles.name}>Khung giờ</Text><TextInput editable={!save.isPending} style={styles.input} value={form.khung_gio_giao} onChangeText={v => change({ khung_gio_giao: v })} />
          <Text style={styles.name}>Ghi chú</Text><TextInput editable={!save.isPending} style={styles.input} value={form.ghi_chu} onChangeText={v => change({ ghi_chu: v })} multiline />
          <Text style={styles.meta}>Lựa chọn size, topping, đá và ngọt được giữ nguyên. Tổng sau sửa phải bằng hoặc cao hơn đơn cũ theo chính sách hiện tại.</Text>
          {preview && <View style={styles.review}><Text style={styles.name}>Tổng mới: {formatCurrency(preview.final_total)}</Text><Text>Chênh lệch: {formatCurrency(preview.amount_difference)}</Text>{preview.wallet_charge > 0 && <Text>Ví sẽ trừ thêm: {formatCurrency(preview.wallet_charge)}</Text>}{preview.wallet_shortfall > 0 && <Text style={styles.error}>Ví còn thiếu {formatCurrency(preview.wallet_shortfall)}.</Text>}</View>}
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </>}
    </ScrollView>
    {allowed && !details.isPending && !details.isError && <Pressable disabled={save.isPending || cart.busy || preview?.wallet_shortfall > 0} onPress={() => save.mutate()} style={styles.button}><Text style={styles.buttonText}>{save.isPending ? 'Đang kiểm tra…' : action === 'reorder' ? 'Thêm các món vào giỏ' : preview ? 'Xác nhận cập nhật đơn' : 'Xem tổng tiền mới'}</Text></Pressable>}
  </View></View></Modal>
}
const styles = StyleSheet.create({ sheet: { maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' }, header: { padding: 16, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 18, fontWeight: '600' }, body: { padding: 16, gap: 14 }, row: { flexDirection: 'row', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' }, name: { fontSize: 14, fontWeight: '600', lineHeight: 21 }, meta: { color: colors.muted, fontSize: 12, lineHeight: 19 }, quantity: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#f7f7f7', padding: 10, borderRadius: 20 }, input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 14 }, review: { padding: 14, backgroundColor: '#f9f1f2', borderRadius: 8, gap: 8 }, error: { color: colors.primary, lineHeight: 21 }, button: { margin: 16, padding: 15, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '600' } })
