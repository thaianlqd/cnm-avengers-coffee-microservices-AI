import TextInput from '../components/TextInput'
import React, { useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView,  Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'
import * as Location from 'expo-location'
import Image from '../components/CachedImage'
import Modal from '../components/AppModal'
import ScreenHeader from '../components/ScreenHeader'
import { useCart } from '../hooks/useCart'
import { useUser } from '../context/UserContext'
import { useFeedback, errorMessage } from '../context/FeedbackContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, safeArray, paymentMethodOptions, paymentMethodLabels } from '../lib/customerData'
import { evaluateBranchAvailability, inventoryRows } from '../lib/branchAvailability'
import { coordinates, distanceKm, lookupAddress } from '../lib/location'
import { useFulfillment } from '../context/FulfillmentContext'
import provinces from '../data/provinces.json'
import { formatAddress } from '../lib/addressContract.mjs'
const modes = [{ value: 'GIAO_TAN_NOI', label: 'Giao tận nơi' }, { value: 'LAY_TAI_QUAN', label: 'Mang đi' }, { value: 'DUNG_TAI_CHO', label: 'Tại quán' }]
const branchCode = b => String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || b.id || '')
function Section({ title, children }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View> }
function Action({ children, onPress, disabled, secondary }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && { opacity: .5 }]}><Text style={[styles.buttonText, secondary && { color: colors.primary }]}>{children}</Text></Pressable> }
function Picker({ title, value, onPress }) { return <Pressable onPress={onPress} style={styles.picker}><View style={{ flex: 1 }}><Text style={styles.label}>{title}</Text><Text style={styles.value} numberOfLines={2}>{value || 'Chọn'}</Text></View><Ionicons name="chevron-down" size={18} color={colors.muted} /></Pressable> }
export function CartScreen({ navigation, route }) {
  const { user, activeUserId: userId, cartMergeError, retryCartMerge } = useUser()
  const cart = useCart(), notify = useFeedback(), client = useQueryClient(), focused = useIsFocused()
  const { mode, setMode, branch, setBranch } = useFulfillment()
  const [method, setMethod] = useState('INTERNAL')
  const [picker, setPicker] = useState(null), [confirming, setConfirming] = useState(false)
  const [address, setAddress] = useState(''), [city, setCity] = useState(''), [ward, setWard] = useState('')
  const [savedAddressId, setSavedAddressId] = useState(''), [position, setPosition] = useState(null), [locating, setLocating] = useState(false)
  const [table, setTable] = useState(''), [note, setNote] = useState('')
  const [name, setName] = useState(user?.full_name || user?.ho_ten || ''), [phone, setPhone] = useState(user?.phone || user?.so_dien_thoai || '')
  const [payment, setPayment] = useState('THANH_TOAN_KHI_NHAN_HANG')
  const [voucherInput, setVoucherInput] = useState(''), [voucher, setVoucher] = useState('')
  const [result, setResult] = useState(null)
  const checkoutRequest = useRef(null)
  useEffect(() => { setName(user?.full_name || user?.ho_ten || ''); setPhone(user?.phone || user?.so_dien_thoai || ''); setResult(null); setVoucher(''); setSavedAddressId(''); setAddress(''); setPosition(null); setCity(''); setWard('') }, [userId])
  const branchesQuery = useQuery({ queryKey: ['public-branches'], queryFn: () => apiClient.get('/users/branches/public'), staleTime: 60000 })
  const branches = safeArray(branchesQuery.data)
  const catalog = useQuery({ queryKey: ['customer', 'checkout-catalog'], queryFn: () => apiClient.get('/menu/san-pham'), staleTime: 60000 })
  const addressesQuery = useQuery({ queryKey: ['customer', 'addresses', userId], queryFn: () => apiClient.get(`/users/${userId}/addresses`), enabled: Boolean(user), staleTime: 30000 })
  const addresses = safeArray(addressesQuery.data)
  const fullAddress = formatAddress(address, ward, city)
  const chooseAddress = a => {
    setSavedAddressId(String(a.id)); setAddress(a.dia_chi_day_du || a.diaChiDayDu || a.dia_chi || '')
    setCity(''); setWard(''); setPosition(coordinates(a)); if (mode === 'GIAO_TAN_NOI') setBranch('')
  }
  useEffect(() => { if (!savedAddressId && !address && addresses.length) chooseAddress(addresses.find(a => a.mac_dinh) || addresses[0]) }, [addressesQuery.data])
  const eligibleBranches = useMemo(() => branches.map(b => ({ ...b, distance: distanceKm(position, coordinates(b)) }))
    .filter(b => mode !== 'GIAO_TAN_NOI' || (b.distance !== null && b.distance <= 5))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)), [branchesQuery.data, position, mode])
  useEffect(() => { if (branch && (mode !== 'GIAO_TAN_NOI' || position) && !eligibleBranches.some(b => branchCode(b) === branch)) setBranch('') }, [eligibleBranches, branch])
  const inventory = useQuery({ queryKey: ['customer', 'branch-inventory', branch], queryFn: () => apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(branch)}`), enabled: Boolean(branch), staleTime: 5000 })
  const availability = evaluateBranchAvailability(cart.items, safeArray(catalog.data), inventoryRows(inventory.data))
  const selectedBranch = branches.find(b => branchCode(b) === branch)
  const voucherQuery = useQuery({ queryKey: ['customer', 'checkout-vouchers', userId], queryFn: () => apiClient.get(`/vouchers?ma_nguoi_dung=${userId}`), enabled: Boolean(user), staleTime: 30000 })
  const walletQuery = useQuery({ queryKey: ['userWallet', userId], queryFn: () => apiClient.get(`/customers/${userId}/wallet`), enabled: Boolean(user), staleTime: 10000 })
  const wallet = walletQuery.data?.data || walletQuery.data
  const balance = Number(wallet?.wallet?.balance ?? wallet?.balance ?? 0)
  const quote = useQuery({ queryKey: ['customer', 'cart-quote', userId, JSON.stringify(cart.data), mode, method, voucher],
    queryFn: () => apiClient.post(`/cart/${userId}/quote`, { delivery_mode: mode, delivery_method: method, voucher_code: voucher || undefined }),
    enabled: Boolean(user && cart.count && focused && !result), retry: false, staleTime: 0 })
  const total = quote.data?.final_total
  const subtotal = quote.data?.subtotal ?? cart.items.reduce((n, i) => n + i.gia_ban * i.so_luong, 0)
  const discount = quote.data?.discount_amount ?? 0, fee = quote.data?.delivery_fee ?? 0
  const changeLine = async (item, quantity) => {
    if (cart.busy) return
    try { if (quantity <= 0) await cart.remove(item.id); else await cart.update(item.id, { so_luong: quantity }) }
    catch (error) { notify(errorMessage(error), 'error') }
  }
  const locate = async (gps) => {
    if (locating) return
    setLocating(true)
    try {
      let next
      if (gps) {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.status !== 'granted') throw new Error('Chưa được cấp quyền vị trí. Bạn có thể nhập và kiểm tra địa chỉ.')
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        next = coordinates(location.coords)
      } else {
        if (!address.trim()) throw new Error('Nhập số nhà và tên đường trước khi kiểm tra.')
        next = await lookupAddress(fullAddress)
      }
      setPosition(next); setBranch('')
      notify(gps ? 'Đã lấy vị trí GPS. Kiểm tra địa chỉ nhận hàng bên dưới.' : 'Đã kiểm tra vị trí địa chỉ')
    } catch (error) { notify(errorMessage(error), 'error') }
    finally { setLocating(false) }
  }
  const applyVoucher = async code => {
    if (!user) { navigation.navigate('Login'); return }
    try {
      await apiClient.post(`/cart/${userId}/quote`, { delivery_mode: mode, delivery_method: method, voucher_code: code.trim() })
      setVoucher(code.trim()); setVoucherInput(code.trim()); notify('Đã áp dụng mã giảm giá')
    } catch (error) { notify(errorMessage(error), 'error') }
  }
  useEffect(() => {
    const code = route?.params?.voucherCode
    if (code && cart.count && user) { setVoucherInput(code); applyVoucher(code); navigation.setParams({ voucherCode: null }) }
  }, [route?.params?.voucherCode, cart.count, userId])
  const checkout = useMutation({ mutationFn: async () => {
    // Recheck inventory and price immediately before creating an order.
    const [freshInventory, freshCatalog, freshQuote] = await Promise.all([
      apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(branch)}`), apiClient.get('/menu/san-pham'),
      apiClient.post(`/cart/${userId}/quote`, { delivery_mode: mode, delivery_method: method, voucher_code: voucher || undefined }) ])
    const actualItems = safeArray(freshQuote)
    if (!actualItems.length) throw new Error('Giỏ hàng vừa thay đổi. Vui lòng tải lại giỏ.')
    if (!evaluateBranchAvailability(actualItems, safeArray(freshCatalog), inventoryRows(freshInventory)).is_fully_available) throw new Error('Có món chưa thể bán ở cửa hàng này. Vui lòng chọn cửa hàng khác hoặc sửa giỏ.')
    if (Number(freshQuote.final_total) !== Number(total)) { await quote.refetch(); throw new Error('Giá giỏ vừa thay đổi. Vui lòng kiểm tra tổng tiền và xác nhận lại.') }
    const payload = { expected_final_total: freshQuote.final_total, phuong_thuc_thanh_toan: payment,
      delivery_mode: mode, delivery_method: method, branch_code: branch,
      dia_chi_giao_hang: mode === 'GIAO_TAN_NOI' ? fullAddress : selectedBranch?.dia_chi,
      destination_latitude: mode === 'GIAO_TAN_NOI' ? position?.latitude : undefined,
      destination_longitude: mode === 'GIAO_TAN_NOI' ? position?.longitude : undefined,
      table_number: mode === 'DUNG_TAI_CHO' ? table.trim() || undefined : undefined,
      ghi_chu: note.trim(), ma_voucher: voucher || undefined, ten_khach_hang: name.trim(), guest_phone: phone.trim(), guest_email: user?.email,
      khung_gio_giao: 'Giao ngay', }
    const fingerprint = JSON.stringify({ payload, revision: freshQuote.revision, cart_version: freshQuote.cart_version })
    if (checkoutRequest.current?.fingerprint !== fingerprint) checkoutRequest.current = { fingerprint, id: randomUUID() }
    return apiClient.post(`/customers/${userId}/thanh-toan/khoi-tao`, { ...payload, checkout_action_id: checkoutRequest.current.id })
  }, onSuccess: async response => {
    setConfirming(false); setResult(response)
    await client.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
    client.invalidateQueries({ queryKey: ['customer', 'orders', userId] }); client.invalidateQueries({ queryKey: ['userWallet', userId] })
    if (response.redirect_url) Linking.openURL(response.redirect_url).catch(() => notify('Chạm Mở thanh toán để mở lại trang ngân hàng.', 'error'))
  }, onError: error => { setConfirming(false); notify(errorMessage(error), 'error') } })
  const requestCheckout = () => {
    if (!user) { navigation.navigate('Login'); return }
    if (!cart.count) return
    if (quote.isFetching || quote.isError || total == null) { notify('Chưa xác nhận được giá giỏ hàng. Vui lòng thử lại.', 'error'); return }
    if (!name.trim() || !/^\+?[0-9\s.-]{9,15}$/.test(phone.trim())) { notify('Điền tên và số điện thoại nhận hàng hợp lệ.', 'error'); return }
    if (mode === 'GIAO_TAN_NOI' && (!address.trim() || !position)) { notify('Nhập địa chỉ và kiểm tra vị trí trước khi đặt hàng.', 'error'); return }
    if (!branch || !availability.is_fully_available) { notify('Chọn cửa hàng có đủ món trong giỏ.', 'error'); return }
    if (payment === 'VI_DIEN_TU' && (walletQuery.isError || balance < total)) { notify('Số dư ví chưa đủ thanh toán.', 'error'); return }
    setConfirming(true)
  }
  const orderId = result?.don_hang?.ma_don_hang || result?.don_hang?.id
  const status = useQuery({ queryKey: ['customer', 'payment-status', userId, orderId], queryFn: () => apiClient.get(`/customers/${userId}/thanh-toan/don-hang/${orderId}/trang-thai`), enabled: Boolean(orderId && focused),
    refetchInterval: q => ['DA_THANH_TOAN', 'THAT_BAI'].includes((q.state.data?.don_hang || q.state.data)?.trang_thai_thanh_toan) || payment === 'THANH_TOAN_KHI_NHAN_HANG' ? false : 5000 })
  if (result) {
    const order = status.data?.don_hang || status.data || result.don_hang
    const paid = order?.trang_thai_thanh_toan === 'DA_THANH_TOAN'
    return <View style={styles.screen}><ScreenHeader title="Thông tin đặt hàng" onBack={() => setResult(null)} /><ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Ionicons name="checkmark-circle-outline" size={54} color={colors.primary} />
      <Text style={styles.title}>Đơn hàng đã được tạo</Text><Text selectable style={styles.value}>#{orderId}</Text>
      <Text style={styles.value}>{payment === 'THANH_TOAN_KHI_NHAN_HANG' ? 'Thanh toán khi nhận hàng' : paid ? 'Đã thanh toán' : order?.trang_thai_thanh_toan === 'THAT_BAI' ? 'Thanh toán chưa thành công' : 'Chờ ngân hàng xác nhận thanh toán'}</Text>
      {status.isError && <Text style={styles.error}>Chưa cập nhật được trạng thái thanh toán.</Text>}
      {!paid && result.payment_details?.qr_img_url && <><Text>Quét mã để thanh toán</Text><Image source={{ uri: result.payment_details.qr_img_url }} style={{ width: '100%', height: 240 }} resizeMode="contain" /><Text selectable>{result.payment_details.ma_tham_chieu}</Text></>}
      {!paid && result.redirect_url && <Action onPress={() => Linking.openURL(result.redirect_url)}>Mở thanh toán ngân hàng</Action>}
      <Action onPress={() => { setResult(null); navigation.navigate('Orders') }}>Theo dõi đơn hàng</Action>
      <Action secondary onPress={() => { setResult(null); navigation.navigate('Menu') }}>Tiếp tục chọn món</Action>
    </ScrollView></View>
  }
  const openPicker = (title, options, value, select) => setPicker({ title, options, value, select })
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenHeader title={`Giỏ hàng${cart.count ? ` (${cart.count})` : ''}`} onBack={() => navigation.navigate('Menu')} />
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
      {cartMergeError && <Pressable onPress={async () => { try { await retryCartMerge(); await cart.refetch(); notify('Đã chuyển giỏ khách vào tài khoản') } catch (error) { notify(errorMessage(error), 'error') } }} style={styles.section}><Text style={styles.error}>{cartMergeError}</Text></Pressable>}
      {cart.isPending ? <ActivityIndicator style={{ margin: 32 }} color={colors.primary} /> : cart.isError ? <Section title="Chưa tải được giỏ hàng"><Text style={styles.error}>{errorMessage(cart.error)}</Text><Action onPress={() => cart.refetch()}>Thử lại</Action></Section> : !cart.count ? <View style={styles.empty}><Ionicons name="bag-handle-outline" size={60} color="#aaa" /><Text style={styles.title}>Giỏ hàng đang trống</Text><Text style={styles.label}>Chọn món bạn thích để bắt đầu.</Text><Action onPress={() => navigation.navigate('Menu')}>Khám phá thực đơn</Action></View> : <>
      <Section title="Món đã chọn">{cart.items.map(item => <View key={item.id} style={styles.line}>
        <Pressable onPress={() => navigation.navigate('Menu', { editCartItem: item })} style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
          <Image source={{ uri: item.hinh_anh_url }} style={{ width: 64, height: 64, borderRadius: 8 }} resizeMode="contain" />
          <View style={{ flex: 1 }}><Text style={styles.value}>{item.ten_san_pham}</Text><Text style={styles.label}>{[item.size, ...item.toppings, item.luong_da, item.do_ngot].filter(Boolean).join(' · ')}</Text>{!!item.ghi_chu && <Text style={styles.label}>{item.ghi_chu}</Text>}<Text style={styles.price}>{formatCurrency(item.gia_ban * item.so_luong)}</Text><Text style={[styles.label, { color: colors.primary }]}>Sửa lựa chọn</Text></View>
        </Pressable><View style={{ alignItems: 'center', gap: 6 }}><Pressable disabled={cart.busy} accessibilityLabel={`Xóa ${item.ten_san_pham}`} onPress={() => changeLine(item, 0)} style={{ padding: 6 }}><Ionicons name="trash-outline" size={17} color={colors.muted} /></Pressable><View style={styles.quantity}><Pressable disabled={cart.busy} onPress={() => changeLine(item, item.so_luong - 1)} style={styles.qtyButton}><Ionicons name="remove" size={18} /></Pressable><Text>{item.so_luong}</Text><Pressable disabled={cart.busy} onPress={() => changeLine(item, item.so_luong + 1)} style={styles.qtyButton}><Ionicons name="add" size={18} /></Pressable></View></View>
      </View>)}</Section>
      <Section title="Hình thức nhận món"><View style={{ flexDirection: 'row', gap: 6 }}>{modes.map(m => <Pressable key={m.value} onPress={() => { setMode(m.value); setBranch('') }} style={[styles.chip, { flex: 1 }, mode === m.value && styles.activeChip]}><Text style={{ fontSize: 12, textAlign: 'center', color: mode === m.value ? '#fff' : colors.text }}>{m.label}</Text></Pressable>)}</View>
        {mode === 'GIAO_TAN_NOI' && <><Picker title="Đơn vị giao hàng" value={method === 'INTERNAL' ? 'Avengers Delivery' : 'Lalamove'} onPress={() => openPicker('Đơn vị giao hàng', [{ value: 'INTERNAL', label: 'Avengers Delivery' }, { value: 'LALAMOVE', label: 'Lalamove' }], method, setMethod)} />
          {!!addresses.length && <Picker title="Địa chỉ đã lưu" value={addresses.find(a => String(a.id) === savedAddressId)?.ten_dia_chi || 'Chọn địa chỉ đã lưu'} onPress={() => openPicker('Địa chỉ đã lưu', addresses.map(a => ({ value: String(a.id), label: `${a.ten_dia_chi || 'Địa chỉ'} · ${a.dia_chi_day_du || a.diaChiDayDu}` })), savedAddressId, id => chooseAddress(addresses.find(a => String(a.id) === id)))} />}
          {addressesQuery.isError && <Text style={styles.error}>Chưa tải được địa chỉ đã lưu.</Text>}
          <TextInput style={styles.input} placeholder="Số nhà, tên đường hoặc địa chỉ đầy đủ" value={address} onChangeText={t => { setAddress(t); setPosition(null); setSavedAddressId('') }} multiline />
          <Picker title="Tỉnh / thành phố" value={city} onPress={() => openPicker('Tỉnh / thành phố', provinces.map(p => ({ value: p.name, label: p.name })), city, v => { setCity(v); setWard(''); setPosition(null) })} />
          {!!city && <Picker title="Phường / xã" value={ward} onPress={() => openPicker('Phường / xã', (provinces.find(p => p.name === city)?.wards || []).map(w => ({ value: w.name, label: w.name })), ward, v => { setWard(v); setPosition(null) })} />}
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Action secondary disabled={locating} onPress={() => locate(false)}>{locating ? 'Đang định vị…' : 'Kiểm tra địa chỉ'}</Action></View><View style={{ flex: 1 }}><Action secondary disabled={locating} onPress={() => locate(true)}>Lấy vị trí GPS</Action></View></View>
          {position && <Text style={styles.label}>Đã xác định vị trí · Cửa hàng phục vụ trong bán kính 5 km</Text>}
        </>}
        <Picker title={mode === 'GIAO_TAN_NOI' ? 'Cửa hàng phục vụ (5 km)' : 'Cửa hàng nhận món'} value={selectedBranch?.ten_chi_nhanh} onPress={() => openPicker('Chọn cửa hàng', eligibleBranches.map(b => ({ value: branchCode(b), label: `${b.ten_chi_nhanh}${b.distance != null ? ` · ${b.distance.toFixed(1)} km` : ''}\n${b.dia_chi}` })), branch, setBranch)} />
        {branchesQuery.isError && <Action secondary onPress={() => branchesQuery.refetch()}>Tải lại cửa hàng</Action>}
        {mode === 'GIAO_TAN_NOI' && position && !eligibleBranches.length && <Text style={styles.error}>Chưa có cửa hàng phục vụ trong 5 km. Bạn có thể chọn mang đi hoặc tại quán.</Text>}
        {!!branch && <Text style={availability.is_fully_available ? styles.label : styles.error}>{inventory.isFetching ? 'Đang kiểm tra món tại cửa hàng…' : availability.is_fully_available ? 'Cửa hàng đang có đủ món trong giỏ' : availability.unavailable_products.length ? `Tạm hết: ${availability.unavailable_products.map(p => p.product_name).join(', ')}` : 'Chưa xác minh được món tại cửa hàng. Vui lòng thử lại.'}</Text>}
        {inventory.isError && <Action secondary onPress={() => inventory.refetch()}>Kiểm tra lại món</Action>}
        {mode === 'DUNG_TAI_CHO' && <TextInput style={styles.input} placeholder="Số bàn (nếu có)" value={table} onChangeText={setTable} />}
      </Section>
      <Section title="Thông tin nhận hàng"><TextInput style={styles.input} placeholder="Tên người nhận" value={name} onChangeText={setName} /><TextInput style={styles.input} placeholder="Số điện thoại" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /><TextInput style={styles.input} placeholder="Ghi chú cho quán / tài xế" value={note} onChangeText={setNote} multiline /></Section>
      <Section title="Ưu đãi"><View style={{ flexDirection: 'row', gap: 8 }}><TextInput style={[styles.input, { flex: 1 }]} placeholder="Nhập mã giảm giá" autoCapitalize="characters" value={voucherInput} onChangeText={setVoucherInput} /><Pressable onPress={() => applyVoucher(voucherInput)} style={styles.chip}><Text style={styles.price}>Áp dụng</Text></Pressable></View>
        {!!voucher && <Pressable onPress={() => { setVoucher(''); setVoucherInput('') }}><Text style={styles.price}>{voucher} · Bỏ mã</Text></Pressable>}
        {safeArray(voucherQuery.data).map(v => { const code = v.ma_voucher || v.ma_khuyen_mai; return <Pressable key={code} onPress={() => applyVoucher(code)} style={styles.picker}><View style={{ flex: 1 }}><Text style={styles.value}>{v.ten_khuyen_mai || v.mo_ta || code}</Text><Text style={styles.label}>{code}{v.han_su_dung ? ` · HSD ${new Date(v.han_su_dung).toLocaleDateString('vi-VN')}` : ''}</Text></View><Text style={styles.price}>Dùng</Text></Pressable> })}
        {voucherQuery.isError && <Text style={styles.error}>Chưa tải được ưu đãi tài khoản.</Text>}
      </Section>
      <Section title="Thanh toán"><Picker title="Phương thức" value={paymentMethodLabels[payment]} onPress={() => openPicker('Phương thức thanh toán', paymentMethodOptions.map(p => ({ value: p.value, label: `${p.label} · ${p.value === 'VI_DIEN_TU' ? walletQuery.isError ? 'Chưa tải được số dư' : formatCurrency(balance) : p.description}` })), payment, setPayment)} />
        <View style={styles.summaryRow}><Text>Tạm tính ({cart.count} món)</Text><Text>{formatCurrency(subtotal)}</Text></View>
        {!!discount && <View style={styles.summaryRow}><Text>Giảm giá</Text><Text>−{formatCurrency(discount)}</Text></View>}
        {mode === 'GIAO_TAN_NOI' && user && quote.data && <><View style={styles.summaryRow}><Text>Phí giao hàng</Text><Text>{formatCurrency(fee)}</Text></View>{quote.data.delivery_fee_discount > 0 && <Text style={styles.label}>Ưu đãi freeship thành viên: −{formatCurrency(quote.data.delivery_fee_discount)}</Text>}</>}
        {quote.isFetching && <Text style={styles.label}>Đang xác nhận tổng tiền…</Text>}
        {quote.isError && <><Text style={styles.error}>{errorMessage(quote.error)}</Text><Action secondary onPress={() => quote.refetch()}>Kiểm tra lại giá</Action></>}
        <View style={styles.summaryRow}><Text style={styles.sectionTitle}>Tổng thanh toán</Text><Text style={styles.price}>{total != null && !quote.isError ? formatCurrency(total) : user ? 'Chờ báo giá' : 'Đăng nhập để xem'}</Text></View>
      </Section></>}
    </ScrollView>
    {!!cart.count && <View style={styles.footer}><Action disabled={cart.busy || checkout.isPending || (Boolean(user) && quote.isFetching)} onPress={requestCheckout}>{checkout.isPending ? 'Đang đặt hàng…' : user ? 'Xác nhận đặt hàng' : 'Đăng nhập để đặt hàng'}</Action></View>}
    <Modal visible={Boolean(picker)} transparent animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.sectionTitle}>{picker?.title}</Text><Pressable onPress={() => setPicker(null)} style={{ padding: 10 }}><Ionicons name="close" size={23} /></Pressable></View><FlatList data={picker?.options || []} keyExtractor={o => String(o.value)} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={{ padding: 20 }}>Chưa có lựa chọn phù hợp.</Text>} renderItem={({ item: o }) => <Pressable onPress={() => { picker.select(o.value); setPicker(null) }} style={styles.picker}><Text style={[styles.value, { flex: 1 }]}>{o.label}</Text>{o.value === picker.value && <Ionicons name="checkmark" color={colors.primary} size={22} />}</Pressable>} /></View></View></Modal>
    <Modal visible={confirming} transparent onRequestClose={() => !checkout.isPending && setConfirming(false)}><View style={styles.overlay}><View style={[styles.sheet, { padding: 20, height: 'auto', gap: 12 }]}><Text style={styles.title}>Xác nhận đơn hàng</Text><Text>{cart.count} món · {formatCurrency(total)}</Text><Text>{modes.find(m => m.value === mode)?.label} · {selectedBranch?.ten_chi_nhanh}</Text>{mode === 'GIAO_TAN_NOI' && <Text>{fullAddress}</Text>}<Text>{paymentMethodLabels[payment]}</Text><Action disabled={checkout.isPending} onPress={() => checkout.mutate()}>{checkout.isPending ? 'Đang gửi đơn…' : 'Đặt hàng'}</Action><Action disabled={checkout.isPending} secondary onPress={() => setConfirming(false)}>Quay lại kiểm tra</Action></View></View></Modal>
  </KeyboardAvoidingView>
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' }, section: { padding: 16, marginBottom: 8, backgroundColor: '#fff', gap: 12 }, sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  title: { fontSize: 22, fontWeight: '700', color: colors.text }, value: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '500' }, label: { color: colors.muted, fontSize: 12, lineHeight: 18 }, price: { fontSize: 15, color: colors.primary, fontWeight: '700' }, error: { color: colors.primary, fontSize: 13, lineHeight: 20 },
  line: { flexDirection: 'row', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' }, quantity: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#ddd' }, qtyButton: { padding: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, color: colors.text, minHeight: 44 }, picker: { paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#eee', borderRadius: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 13, backgroundColor: '#f3f3f3', justifyContent: 'center' }, activeChip: { backgroundColor: colors.primary },
  button: { backgroundColor: colors.primary, padding: 14, minHeight: 46, borderRadius: 24, alignItems: 'center' }, secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8c9cb' }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  footer: { backgroundColor: '#fff', padding: 12, borderTopWidth: 1, borderColor: '#eee' }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, empty: { alignItems: 'center', padding: 32, gap: 16 },
  overlay: { flex: 1, justifyContent: 'flex-end' }, sheet: { backgroundColor: '#fff', height: '75%', maxHeight: '90%', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' }, sheetHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
