import TextInput from './TextInput'
import React, { useEffect, useState } from 'react'
import { View, Text, Pressable,  ScrollView, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './AppModal'
import Pagination, { usePagination } from './Pagination'
import Reveal from './Reveal'
import api from '../lib/apiClient'
import { safeArray, formatDateTime, getUserId, getUserDisplayName } from '../lib/customerData'
import { useUser } from '../context/UserContext'
import { useFeedback, errorMessage } from '../context/FeedbackContext'
import { colors } from '../theme'

export function Stars({ value, onChange, label = 'Số sao' }) {
  return <View style={{ flexDirection: 'row', gap: onChange ? 6 : 2 }}>{[1,2,3,4,5].map(n => <Pressable key={n} disabled={!onChange} accessibilityLabel={`${label}: ${n} sao`} accessibilityState={{ selected: n === value }} onPress={() => onChange?.(n)} style={{ padding: onChange ? 7 : 0 }}><Ionicons name={n <= value ? 'star' : 'star-outline'} size={onChange ? 27 : 14} color="#d59b28" /></Pressable>)}</View>
}
export function ReviewPanel({ type = 'product', id }) {
  const query = useQuery({ queryKey: ['reviews', type, String(id)], queryFn: () => api.get(type === 'branch' ? `/branch-reviews/branch/${encodeURIComponent(id)}` : `/products/${encodeURIComponent(id)}/reviews`), enabled: Boolean(id), staleTime: 30000 })
  const paging = usePagination(safeArray(query.data), `${type}:${id}`)
  const count = query.data?.tongReview ?? query.data?.tong_luot_danh_gia ?? 0
  const average = query.data?.diemTrungBinh ?? query.data?.diem_trung_binh ?? 0
  return <View style={{ gap: 14 }}>
    <Text style={{ fontSize: 18, fontWeight: '700' }}>Đánh giá {type === 'branch' ? 'cửa hàng' : 'sản phẩm'}</Text>
    {query.isPending ? <ActivityIndicator color={colors.primary} /> : query.isError ? <Pressable onPress={() => query.refetch()}><Text style={{ color: colors.primary }}>Chưa tải được đánh giá. Thử lại</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Stars value={Math.round(average)} /><Text style={{ color: colors.muted }}>{count ? `${average}/5 · ${count} đánh giá` : 'Chưa có đánh giá'}</Text></View>
      {paging.items.map(r => <Reveal key={r.id}><View style={{ borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 14, gap: 6 }}><Text style={{ fontWeight: '600' }}>{r.ten_nguoi_dung || 'Khách hàng'}</Text><View style={{ flexDirection: 'row', gap: 10 }}><Stars value={r.so_sao ?? r.diem_tong_quan} /><Text style={{ fontSize: 11, color: colors.muted }}>{formatDateTime(r.ngay_tao)}</Text></View>{!!(r.binh_luan || r.nhan_xet) && <Text style={{ lineHeight: 21 }}>{r.binh_luan || r.nhan_xet}</Text>}{!!r.phan_hoi && <View style={{ backgroundColor: '#f7f7f7', padding: 12, borderRadius: 8 }}><Text style={{ fontWeight: '600', fontSize: 12 }}>Phản hồi từ cửa hàng</Text><Text style={{ lineHeight: 21, marginTop: 4 }}>{r.phan_hoi}</Text></View>}</View></Reveal>)}
      <Pagination {...paging} onChange={paging.setPage} />
    </>}
  </View>
}

export function ReviewEditor({ target, onClose, onSaved }) {
  const { user } = useUser(), userId = getUserId(user), notify = useFeedback(), client = useQueryClient()
  const [rating, setRating] = useState(0), [comment, setComment] = useState(''), [criteria, setCriteria] = useState({}), [error, setError] = useState('')
  const orderId = target?.order?.ma_don_hang, id = target?.id, type = target?.type
  const existing = useQuery({ queryKey: ['review-existing', type, id, userId, orderId], enabled: Boolean(target && userId && orderId), retry: false, queryFn: async () => {
    if (type === 'branch') return api.get(`/branch-reviews/check?orderId=${encodeURIComponent(orderId)}&userId=${encodeURIComponent(userId)}`)
    if (type === 'shipper') return api.get(`/shippers/delivery/tracking/${encodeURIComponent(orderId)}`)
    const data = await api.get(`/products/${encodeURIComponent(id)}/reviews`)
    return { item: safeArray(data).find(r => String(r.ma_nguoi_dung) === userId && r.ma_don_hang === orderId) }
  } })
  useEffect(() => { const r = existing.data?.item; if (r) { setRating(r.so_sao); setComment(r.binh_luan || '') } }, [existing.data])
  const branchReviewed = (existing.data === true || Boolean(existing.data?.da_danh_gia || existing.data?.reviewed))
  const shipperReviewed = type === 'shipper' && /\[Đánh giá/.test(existing.data?.shipper_delivery?.delivery_note || '')
  const save = useMutation({ mutationFn: async () => {
    if (!userId || target?.order?.trang_thai_don_hang !== 'HOAN_THANH') throw new Error('Chỉ đánh giá đơn đã hoàn thành của tài khoản của bạn.')
    if (!rating) throw new Error('Bạn hãy chọn số sao trước khi gửi.')
    if (type === 'shipper') return api.post(`/customers/${userId}/orders/${orderId}/rate-shipper`, { rating, comment: comment.trim() })
    if (type === 'branch') {
      if (Object.keys(criteria).length < 4) throw new Error('Bạn hãy chọn điểm cho cả bốn tiêu chí cửa hàng.')
      return api.post('/branch-reviews', { ma_chi_nhanh: id, ...(target.order.co_so_loai === 'KIOSK' ? { ma_kiosk: id } : {}), ten_chi_nhanh: target.name, ma_nguoi_dung: userId, ten_nguoi_dung: getUserDisplayName(user), ma_don_hang: orderId, diem_tong_quan: rating, tieu_chi: criteria, nhan_xet: comment.trim() })
    }
    return api.post(`/products/${encodeURIComponent(id)}/reviews`, { maNguoiDung: userId, soSao: rating, binhLuan: comment.trim(), maDonHang: orderId })
  }, onSuccess: () => { client.invalidateQueries({ queryKey: ['reviews'] }); client.invalidateQueries({ queryKey: ['review-existing'] }); notify('Đã gửi đánh giá. Cảm ơn bạn!'); onSaved?.(); onClose() }, onError: e => setError(errorMessage(e)) })
  const blocked = branchReviewed || shipperReviewed
  return <Modal visible={Boolean(target)} transparent onRequestClose={() => !save.isPending && onClose()}><View style={{ flex: 1, justifyContent: 'flex-end' }}><View style={{ maxHeight: '94%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}><Text style={{ flex: 1, fontSize: 18, fontWeight: '600' }}>Đánh giá {type === 'shipper' ? 'shipper' : type === 'branch' ? 'cửa hàng' : 'món'}</Text><Pressable disabled={save.isPending} onPress={onClose} accessibilityLabel="Đóng đánh giá"><Ionicons name="close" size={24} /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontWeight: '600', lineHeight: 22 }}>{target?.name}</Text><Text style={{ fontSize: 12, color: colors.muted }}>Đơn #{orderId?.slice(0,8)} · {formatDateTime(target?.order?.ngay_tao)}</Text>
      {existing.isPending ? <ActivityIndicator color={colors.primary} /> : existing.isError ? <Pressable onPress={() => existing.refetch()}><Text style={{ color: colors.primary }}>Chưa kiểm tra được đánh giá. Thử lại</Text></Pressable> : blocked ? <Text>Bạn đã đánh giá {type === 'branch' ? 'cửa hàng' : 'shipper'} cho đơn này.</Text> : <>
        {!!existing.data?.item && <Text style={{ color: colors.muted }}>Bạn có thể cập nhật đánh giá đã gửi.</Text>}
        <Text>Trải nghiệm của bạn</Text><Stars value={rating} onChange={setRating} />
        {type === 'branch' && Object.entries({ phuc_vu: 'Phục vụ', ve_sinh: 'Vệ sinh', toc_do: 'Tốc độ', chat_luong_mon: 'Chất lượng món' }).map(([key,label]) => <View key={key}><Text>{label}</Text><Stars label={label} value={criteria[key] || 0} onChange={value => setCriteria(old => ({ ...old, [key]: value }))} /></View>)}
        <TextInput accessibilityLabel="Nhận xét của bạn" placeholder="Chia sẻ cảm nhận của bạn…" multiline maxLength={2000} value={comment} onChangeText={setComment} editable={!save.isPending} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, minHeight: 105, padding: 12, textAlignVertical: 'top' }} />
      </>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.primary }}>{error}</Text>}
    </ScrollView>
    {!blocked && <Pressable disabled={save.isPending || !rating || !existing.isSuccess} onPress={() => save.mutate()} style={{ margin: 16, backgroundColor: colors.primary, opacity: !rating || !existing.isSuccess ? .5 : 1, padding: 15, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '600' }}>{save.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}</Text></Pressable>}
  </View></View></Modal>
}
