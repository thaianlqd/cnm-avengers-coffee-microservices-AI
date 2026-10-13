import TextInput from '../components/TextInput'
import React, { useState } from 'react'
import { View, Text, ScrollView,  Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ScreenHeader from '../components/ScreenHeader'
import { useUser } from '../context/UserContext'
import { errorMessage } from '../context/FeedbackContext'
import { getUserId, getUserDisplayName } from '../lib/customerData'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
export function SurveyScreen({ navigation, route }) {
  const { user } = useUser(), userId = getUserId(user), client = useQueryClient()
  const [answers, setAnswers] = useState({}), [name, setName] = useState(''), [phone, setPhone] = useState(''), [error, setError] = useState('')
  const form = useQuery({ queryKey: ['active-survey-form'], queryFn: () => apiClient.get('/surveys/forms/active'), retry: false })
  const submit = useMutation({ mutationFn: payload => apiClient.post('/surveys/responses', payload), onSuccess: () => client.invalidateQueries({ queryKey: ['customer', 'vouchers'] }), onError: e => setError(errorMessage(e)) })
  const setAnswer = (id, value) => setAnswers(prev => ({ ...prev, [id]: value }))
  const send = () => {
    if (submit.isPending) return
    setError('')
    for (const q of form.data?.cau_hoi || []) {
      const value = answers[q.id]
      if (q.bat_buoc && (value == null || value === '' || (Array.isArray(value) && !value.length))) { setError(`Vui lòng trả lời: ${q.tieu_de}`); return }
      if (q.loai === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { setError('Nhập ngày theo YYYY-MM-DD.'); return }
      if (q.loai === 'time' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { setError('Nhập giờ theo HH:MM.'); return }
    }
    submit.mutate({ ma_bieu_mau: form.data.id, ma_nguoi_dung: userId || undefined,
      ten_nguoi_dung: user ? getUserDisplayName(user) : name.trim() || undefined,
      so_dien_thoai: user?.phone || phone.trim() || undefined, ma_don_hang: route?.params?.orderId || undefined,
      tra_loi: form.data.cau_hoi.map(q => ({ cau_hoi_id: q.id, cau_hoi_tieu_de: q.tieu_de, cau_tra_loi: answers[q.id] ?? '' })) })
  }
  return <View style={{ flex: 1, backgroundColor: '#fafafa' }}><ScreenHeader title="Khảo sát khách hàng" onBack={() => navigation.goBack()} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {form.isPending ? <ActivityIndicator color={colors.primary} /> : form.isError ? <><Text style={styles.error}>Chưa tải được khảo sát.</Text><Pressable onPress={() => form.refetch()} style={styles.button}><Text style={styles.buttonText}>Thử lại</Text></Pressable></> : submit.isSuccess ? <>
        <Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} /><Text style={styles.title}>Cảm ơn bạn đã góp ý</Text><Text style={styles.body}>Phản hồi đã được gửi tới hệ thống.</Text>
        {!!submit.data?.voucher_code && <View style={styles.card}><Text>Mã ưu đãi của bạn</Text><Text selectable style={styles.title}>{submit.data.voucher_code}</Text>{!!submit.data.voucher_expiry && <Text>HSD {new Date(submit.data.voucher_expiry).toLocaleDateString('vi-VN')}</Text>}</View>}
        <Pressable onPress={() => navigation.goBack()} style={styles.button}><Text style={styles.buttonText}>Quay lại</Text></Pressable>
      </> : !form.data?.id ? <Text style={styles.body}>Hiện chưa có khảo sát đang mở.</Text> : <>
        <Text style={styles.title}>{form.data.ten_form || form.data.tieu_de || 'Trải nghiệm của bạn'}</Text>{!!form.data.mo_ta && <Text style={styles.body}>{form.data.mo_ta}</Text>}
        {!user && <View style={styles.card}><TextInput style={styles.input} placeholder="Tên của bạn (không bắt buộc)" value={name} onChangeText={setName} /><TextInput style={styles.input} placeholder="Số điện thoại (không bắt buộc)" value={phone} keyboardType="phone-pad" onChangeText={setPhone} /></View>}
        {(form.data.cau_hoi || []).map(q => <View key={q.id} style={styles.card}><Text style={styles.question}>{q.tieu_de}{q.bat_buoc ? ' *' : ''}</Text>
          {q.loai === 'rating' ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[1,2,3,4,5].map(n => <Pressable key={n} accessibilityLabel={`${n} sao`} onPress={() => setAnswer(q.id, n)} style={{ padding: 6 }}><Ionicons name={n <= (answers[q.id] || 0) ? 'star' : 'star-outline'} size={30} color={colors.primary} /></Pressable>)}</View> : ['choice', 'checkbox', 'dropdown'].includes(q.loai) ? (q.lua_chon || []).map(option => {
            const selected = q.loai === 'checkbox' ? (answers[q.id] || []).includes(option) : answers[q.id] === option
            return <Pressable key={option} onPress={() => setAnswer(q.id, q.loai === 'checkbox' ? selected ? answers[q.id].filter(v => v !== option) : [...(answers[q.id] || []), option] : option)} style={[styles.option, selected && { borderColor: colors.primary }]}><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? colors.primary : '#aaa'} /><Text style={{ flex: 1 }}>{option}</Text></Pressable>
          }) : <TextInput style={styles.input} value={String(answers[q.id] || '')} onChangeText={v => setAnswer(q.id, v)} placeholder={q.loai === 'date' ? 'YYYY-MM-DD' : q.loai === 'time' ? 'HH:MM' : 'Câu trả lời của bạn'} multiline={q.loai === 'paragraph'} />}
        </View>)}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable disabled={submit.isPending} onPress={send} style={styles.button}><Text style={styles.buttonText}>{submit.isPending ? 'Đang gửi…' : 'Gửi phản hồi'}</Text></Pressable>
      </>}
    </ScrollView></View>
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 16 }, title: { fontSize: 22, fontWeight: '600', color: colors.text }, body: { fontSize: 14, color: colors.muted, lineHeight: 21 }, card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 12, padding: 16, gap: 12 }, question: { fontSize: 15, lineHeight: 21, fontWeight: '500' }, input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, minHeight: 44 }, option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8 }, button: { backgroundColor: colors.primary, borderRadius: 24, padding: 15, alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' }, error: { color: colors.primary, lineHeight: 20 } })
