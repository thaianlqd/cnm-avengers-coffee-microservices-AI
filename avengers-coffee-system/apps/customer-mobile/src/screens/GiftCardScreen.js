import TextInput from '../components/TextInput'
import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView,  Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import ScreenHeader from '../components/ScreenHeader'
import Image from '../components/CachedImage'
import Modal from '../components/AppModal'
import { useUser } from '../context/UserContext'
import { errorMessage } from '../context/FeedbackContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { getUserId, formatCurrency, safeArray } from '../lib/customerData'
const amounts = [100000, 200000, 300000, 500000, 1000000] // Same supported denominations as web; no invented bonus balance.
export function GiftCardScreen({ navigation }) {
  const { user } = useUser(), userId = getUserId(user)
  const [themeId, setThemeId] = useState(''), [amount, setAmount] = useState(amounts[0])
  const [sender, setSender] = useState(user?.full_name || ''), [receiver, setReceiver] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [message, setMessage] = useState('')
  const [error, setError] = useState(''), [confirm, setConfirm] = useState(false)
  const query = useQuery({ queryKey: ['giftCardThemes'], queryFn: () => apiClient.get('/gift-cards/themes'), staleTime: 60000 })
  const themes = safeArray(query.data), selected = themes.find(t => String(t.id) === themeId)
  useEffect(() => { if (!themeId && themes.length) setThemeId(String(themes[0].id)) }, [query.data, themeId])
  const purchase = useMutation({ mutationFn: () => apiClient.post('/gift-cards/purchase', { value: amount, sender_id: userId, sender_name: sender.trim(), receiver_name: receiver.trim(), receiver_email: email.trim(), receiver_phone: phone.trim() || undefined, message: message.trim(), theme: themeId }),
    onSuccess: data => { setConfirm(false); if (!data.success) setError(data.message || 'Hệ thống chưa xác nhận tạo thẻ.') }, onError: e => { setConfirm(false); setError(errorMessage(e)) } })
  const create = () => { setError(''); if (!userId) { navigation.navigate('Login'); return } if (!themeId || !sender.trim() || !receiver.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Chọn mẫu thẻ và điền tên người gửi, người nhận, email hợp lệ.'); return } setConfirm(true) }
  return <View style={{ flex: 1, backgroundColor: '#fafafa' }}><ScreenHeader title="Thẻ quà tặng" onBack={() => navigation.goBack()} /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {purchase.data?.success ? <><Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} /><Text style={styles.title}>Thẻ đã được tạo</Text><Text selectable style={styles.title}>{purchase.data.data?.code}</Text><Text>{formatCurrency(purchase.data.data?.value)}</Text><Text style={styles.body}>{purchase.data.email_url === true ? 'Hệ thống đã trả kết quả gửi email. Kiểm tra hộp thư người nhận.' : 'Chưa xác nhận gửi email. Bạn có thể chia sẻ mã thẻ bên trên.'}</Text></> : <>
    <Text style={styles.title}>Gửi một lời mời cà phê</Text><Text style={styles.body}>Chọn mẫu thẻ, mệnh giá và người bạn muốn tặng.</Text>
    {query.isPending ? <ActivityIndicator color={colors.primary} /> : query.isError ? <Pressable onPress={() => query.refetch()}><Text style={styles.error}>Chưa tải được mẫu thẻ. Chạm để thử lại.</Text></Pressable> : !themes.length ? <Text>Chưa có mẫu thẻ đang mở.</Text> : <>
      <View style={[styles.card, { backgroundColor: selected?.color || colors.primary }]}>{selected?.image_url ? <Image source={{ uri: selected.image_url }} style={{ width: '100%', height: 120 }} resizeMode="contain" /> : <><Text style={{ color: '#fff', fontSize: 12, letterSpacing: 2 }}>AVENGERS COFFEE CARD</Text><Text style={{ color: '#fff', fontSize: 22, fontWeight: '600', marginTop: 26 }}>{selected?.name}</Text></>}<Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 20 }}>{formatCurrency(amount)}</Text></View>
      <Text style={styles.label}>Mẫu thẻ</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{themes.map(t => <Pressable key={t.id} onPress={() => setThemeId(String(t.id))} style={[styles.chip, themeId === String(t.id) && { borderColor: colors.primary }]}><Text>{t.name}</Text></Pressable>)}</ScrollView>
      <Text style={styles.label}>Mệnh giá</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{amounts.map(v => <Pressable key={v} onPress={() => setAmount(v)} style={[styles.chip, amount === v && { borderColor: colors.primary }]}><Text style={{ color: amount === v ? colors.primary : colors.text }}>{formatCurrency(v)}</Text></Pressable>)}</View>
      <Text style={styles.label}>Thông tin gửi tặng</Text><TextInput style={styles.input} placeholder="Tên người gửi *" value={sender} onChangeText={setSender} /><TextInput style={styles.input} placeholder="Tên người nhận *" value={receiver} onChangeText={setReceiver} /><TextInput style={styles.input} placeholder="Email người nhận *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /><TextInput style={styles.input} placeholder="Số điện thoại người nhận" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><TextInput style={styles.input} placeholder="Lời nhắn" value={message} onChangeText={setMessage} multiline />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable onPress={create} disabled={purchase.isPending} style={styles.button}><Text style={styles.buttonText}>Tạo thẻ {formatCurrency(amount)}</Text></Pressable>
      <Text style={styles.body}>Luồng thẻ hiện tại của hệ thống tạo và gửi mã thẻ; chưa có bước thu tiền qua ngân hàng cho thẻ quà tặng.</Text>
    </> }</>}
  </ScrollView><Modal visible={confirm} transparent onRequestClose={() => !purchase.isPending && setConfirm(false)}><View style={{ flex: 1, justifyContent: 'flex-end' }}><View style={[styles.content, { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}><Text style={styles.title}>Xác nhận gửi tặng</Text><Text>{receiver} · {email}</Text><Text>{formatCurrency(amount)}</Text><Pressable disabled={purchase.isPending} onPress={() => purchase.mutate()} style={styles.button}><Text style={styles.buttonText}>{purchase.isPending ? 'Đang tạo thẻ…' : 'Xác nhận tạo thẻ'}</Text></Pressable><Pressable disabled={purchase.isPending} onPress={() => setConfirm(false)} style={styles.chip}><Text style={{ textAlign: 'center' }}>Quay lại</Text></Pressable></View></View></Modal></View>
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 14 }, title: { fontSize: 22, fontWeight: '600', color: colors.text }, body: { fontSize: 13, lineHeight: 20, color: colors.muted }, label: { fontSize: 15, fontWeight: '600', marginTop: 6 }, card: { padding: 22, borderRadius: 14 }, chip: { padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 }, input: { padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, minHeight: 44, fontSize: 14 }, button: { backgroundColor: colors.primary, padding: 15, borderRadius: 24, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 }, error: { color: colors.primary, lineHeight: 20 } })
