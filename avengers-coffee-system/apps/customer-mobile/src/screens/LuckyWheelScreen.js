import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Modal,
} from 'react-native'
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserId } from '../lib/customerData'
import { colors, shadows } from '../theme'

const SCREEN_WIDTH = Dimensions.get('window').width
const FRAME_SIZE = Math.min(SCREEN_WIDTH - 32, 330)
const INNER_SIZE = FRAME_SIZE - 24
const SVG_RADIUS = INNER_SIZE / 2

const REFERENCE_8_PRIZES = [
  { id: '1', ten: '+50 ĐIỂM', icon: '🎁', mau: '#FF6B6B' },
  { id: '2', ten: '+100 ĐIỂM', icon: '⭐', mau: '#4ECDC4' },
  { id: '3', ten: 'VOUCHER 10K', icon: '🎫', mau: '#45B7D1' },
  { id: '4', ten: '+200 ĐIỂM', icon: '🎁', mau: '#96CEB4' },
  { id: '5', ten: 'VOUCHER 20K', icon: '🏷️', mau: '#FFEAA7' },
  { id: '6', ten: 'FREE TOPPING', icon: '🎁', mau: '#DDA0DD' },
  { id: '7', ten: 'FREE PHIN SỮA ĐÁ', icon: '🎁', mau: '#FF9FF3' },
  { id: '8', ten: 'VOUCHER 50K', icon: '🏆', mau: '#F8B500' },
]

function getSlicePath(cx, cy, r, startAngle, endAngle) {
  const rad1 = (startAngle - 90) * (Math.PI / 180)
  const rad2 = (endAngle - 90) * (Math.PI / 180)
  const x1 = cx + r * Math.cos(rad1)
  const y1 = cy + r * Math.sin(rad1)
  const x2 = cx + r * Math.cos(rad2)
  const y2 = cy + r * Math.sin(rad2)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
}

function formatPrizeDisplayName(prize) {
  if (!prize) return ''
  const name = String(prize.ten || prize.ten_giai_thuong || '')
  if (prize.loai === 'VOUCHER' || name.startsWith('TPL_') || name.startsWith('WHEEL_') || prize.ma_voucher) {
    if (prize.mo_ta && !String(prize.mo_ta).startsWith('TPL_')) {
      return prize.mo_ta
    }
    const val = Number(prize.gia_tri || 0)
    if (val > 0) {
      if (val <= 100) return `Giảm ${val}%`
      if (val >= 1000) return `Voucher ${(val / 1000).toLocaleString('vi-VN')}K`
    }
    if (name.startsWith('TPL_') || name.startsWith('WHEEL_')) return 'Voucher Giảm Giá'
  }
  return name
}

function RenderWheelIcon({ iconType, prizeName, x, y, rot }) {
  const str = String(iconType || '') + ' ' + String(prizeName || '')
  
  let pathD = "M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.67C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1h-2.12l1.43-1.91c.17-.23.43-.37.69-.37zm-6 0c.26 0 .52.14.69.37L11.12 6H9c-.55 0-1-.45-1-1s.45-1 1-1zm11 15H4V8h16v11z"
  
  if (str.includes('🎫') || str.toLowerCase().includes('voucher') || str.includes('TPL_5Z6')) {
    pathD = "M20 4H4c-1.1 0-1.99.9-1.99 2L2 16c0 1.1.9 2 2 2h16c1.1 0 2-.89 2-2V6c0-1.1-.9-2-2-2zm-1 9h-2v-2h2v2zm0-4h-2V9h2v2zm-4 4H5V9h10v6z"
  } else if (str.includes('🏷️') || str.toLowerCase().includes('tag')) {
    pathD = "M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"
  } else if (str.includes('⭐') || str.includes('100') || str.toLowerCase().includes('star')) {
    pathD = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
  } else if (str.includes('🏆') || str.includes('👑') || str.toLowerCase().includes('trophy')) {
    pathD = "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V18H8v2h8v-2h-3v-2.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"
  }

  return (
    <G transform={`translate(${x}, ${y}) rotate(${rot}) translate(-8 -8)`}>
      <Path fill="#ffffff" d={pathD} transform="scale(0.67)" />
    </G>
  )
}

export function LuckyWheelScreen() {
  const navigation = useNavigation()
  const { user } = useUser()
  const userId = getUserId(user) || user?.ma_nguoi_dung || user?.id || ''
  const queryClient = useQueryClient()

  const [isSpinning, setIsSpinning] = useState(false)
  const [prizeResult, setPrizeResult] = useState(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const spinAnim = useRef(new Animated.Value(0)).current
  const currentRotationRef = useRef(0)

  const { data: wheelData, isLoading: isPrizesLoading } = useQuery({
    queryKey: ['luckyWheelPrizes'],
    queryFn: async () => {
      const response = await apiClient.get('/users/lucky-wheel/prizes')
      return response.data || response
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: memData } = useQuery({
    queryKey: ['membership', userId],
    queryFn: async () => {
      if (!userId) return null
      const response = await apiClient.get(`/users/${userId}/membership`)
      return response.data || response
    },
    enabled: Boolean(userId),
    staleTime: 10 * 1000,
  })

  const rawPrizes = Array.isArray(wheelData?.giai_thuong) && wheelData.giai_thuong.length >= 8
    ? wheelData.giai_thuong.slice(0, 8)
    : REFERENCE_8_PRIZES

  const prizes = rawPrizes.map((p, i) => ({
    ...p,
    mau: p.mau || REFERENCE_8_PRIZES[i % 8].mau,
    icon: p.icon || REFERENCE_8_PRIZES[i % 8].icon,
  }))

  const cost = Number(wheelData?.chi_phi_quay || 100)
  const diemKhaDung = Number(memData?.diem_kha_dung ?? user?.diem_kha_dung ?? 0)
  const availableSpins = Math.floor(diemKhaDung / cost)

  const spinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/users/${userId}/lucky-wheel/spin`)
      return response.data || response
    },
    onSuccess: (data) => {
      const winnerId = data?.giai_thuong?.id || data?.id
      const winnerIndex = prizes.findIndex(p => String(p.id) === String(winnerId))
      const idx = winnerIndex >= 0 ? winnerIndex : Math.floor(Math.random() * prizes.length)

      // Calculate rotation angle so winner lands precisely at 12 o'clock top pointer
      const targetSegmentMid = (idx + 0.5) * 45
      const extraRounds = 360 * 6
      const targetDeg = currentRotationRef.current + extraRounds + (360 - (targetSegmentMid % 360))
      currentRotationRef.current = targetDeg

      spinAnim.setValue(0)
      Animated.timing(spinAnim, {
        toValue: targetDeg,
        duration: 5200,
        easing: Easing.bezier(0.1, 0.8, 0.1, 1),
        useNativeDriver: true,
      }).start(() => {
        setIsSpinning(false)
        setPrizeResult(data)
        setShowResultModal(true)
        queryClient.invalidateQueries({ queryKey: ['membership', userId] })
      })
    },
    onError: (err) => {
      setIsSpinning(false)
      Alert.alert('Thông báo', err?.response?.data?.message || 'Có lỗi xảy ra khi quay thưởng.')
    },
  })

  const handleSpin = () => {
    if (!userId) {
      Alert.alert('Yêu cầu đăng nhập', 'Vui lòng đăng nhập tài khoản để quay thưởng.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') },
      ])
      return
    }
    if (isSpinning) return

    if (diemKhaDung < cost) {
      Alert.alert('Chưa đủ điểm', `Bạn cần tối thiểu ${cost} điểm khả dụng để quay. Hiện tại bạn có ${diemKhaDung.toLocaleString('vi-VN')} điểm.`)
      return
    }

    setIsSpinning(true)
    setPrizeResult(null)
    spinMutation.mutate()
  }

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#2b170c', '#4a2310']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Vòng Quay May Mắn</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Hero Header */}
        <View style={styles.heroSection}>
          <View style={styles.heroTitleRow}>
            <Ionicons name="sparkles" size={14} color="#c89a58" />
            <Text style={styles.heroSubHeader}>MINI GAME & GIẢI THƯỞNG</Text>
          </View>
          <Text style={styles.heroTitle}>Vòng quay may mắn 🎡</Text>
          <Text style={styles.heroSubtitle}>
            Dùng {cost} điểm khả dụng / lượt quay. Không trừ điểm xếp hạng!
          </Text>
        </View>

        {isPrizesLoading ? (
          <ActivityIndicator size="large" color="#b22830" style={{ marginVertical: 40 }} />
        ) : (
          <View style={styles.wheelOuterContainer}>
            {/* Top Pointer Badge */}
            <View style={styles.topPointerWrap}>
              <View style={styles.pointerCircleBadge}>
                <Ionicons name="chevron-down" size={18} color="#e5c189" />
              </View>
              <View style={styles.pointerStem} />
            </View>

            {/* Dark Chocolate Outer Frame */}
            <View style={styles.chocolateFrame}>
              <View style={styles.innerGoldBorder} />
              <View style={styles.dashedRing} />

              {/* Animated Rotating SVG Wheel */}
              <Animated.View
                style={[
                  styles.wheelSvgContainer,
                  { transform: [{ rotate: spinRotation }] },
                ]}
              >
                <Svg width={INNER_SIZE} height={INNER_SIZE} viewBox={`0 0 ${INNER_SIZE} ${INNER_SIZE}`}>
                  <G>
                    {prizes.map((item, idx) => {
                      const startAngle = idx * 45
                      const endAngle = (idx + 1) * 45
                      const midAngle = startAngle + 22.5
                      const radMid = (midAngle - 90) * (Math.PI / 180)

                      // Outer Icon position (radius * 0.74)
                      const iconRadius = SVG_RADIUS * 0.74
                      const iconX = SVG_RADIUS + iconRadius * Math.cos(radMid)
                      const iconY = SVG_RADIUS + iconRadius * Math.sin(radMid)

                      // Inner Text position (radius * 0.48 - Plenty of room from center pin!)
                      const nameRadius = SVG_RADIUS * 0.48
                      const nameX = SVG_RADIUS + nameRadius * Math.cos(radMid)
                      const nameY = SVG_RADIUS + nameRadius * Math.sin(radMid)

                      // Rotation along ray (midAngle - 90) matches Web 100%
                      const rot = midAngle - 90

                      const sliceColor = item.mau || REFERENCE_8_PRIZES[idx % 8].mau
                      const displayName = formatPrizeDisplayName(item).toUpperCase()
                      const fontSize = displayName.length > 12 ? '7' : displayName.length > 8 ? '8' : '9'

                      return (
                        <G key={item.id || idx}>
                          {/* Pie Sector */}
                          <Path
                            d={getSlicePath(SVG_RADIUS, SVG_RADIUS, SVG_RADIUS - 1, startAngle, endAngle)}
                            fill={sliceColor}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />

                          {/* Frosted White Circle Badge for Vector Icon */}
                          <Circle
                            cx={iconX}
                            cy={iconY}
                            r={13}
                            fill="rgba(255, 255, 255, 0.25)"
                          />

                          {/* Pure White Vector SVG Icon inside Badge */}
                          <RenderWheelIcon
                            iconType={item.icon}
                            prizeName={item.ten || item.ten_giai_thuong}
                            x={iconX}
                            y={iconY}
                            rot={rot}
                          />

                          {/* Clean Radial Prize Text (Sans-serif, Bold, White) */}
                          <SvgText
                            x={nameX}
                            y={nameY}
                            fill="#ffffff"
                            fontSize={fontSize}
                            fontFamily="System"
                            fontWeight="900"
                            textAnchor="middle"
                            alignmentBaseline="central"
                            transform={`rotate(${rot}, ${nameX}, ${nameY})`}
                          >
                            {displayName}
                          </SvgText>
                        </G>
                      )
                    })}
                  </G>
                </Svg>
              </Animated.View>

              {/* Central Spin Button (Compact Double Bordered Cream/Gold Ring & Red Center - Strictly Centered) */}
              <View style={styles.centerPinWrap}>
                <Pressable
                  onPress={handleSpin}
                  disabled={isSpinning}
                  style={({ pressed }) => [styles.centerSpinBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <LinearGradient colors={['#a81b24', '#781219']} style={styles.centerSpinGrad}>
                    {isSpinning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.centerSpinText}>QUAY</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Points & Cost Summary Card */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>ĐIỂM KHẢ DỤNG CỦA BẠN</Text>
              <Text style={styles.statValueRed}>{diemKhaDung.toLocaleString('vi-VN')} điểm</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>CHI PHÍ / LƯỢT QUAY</Text>
              <Text style={styles.statValueGold}>{cost} điểm</Text>
            </View>
          </View>
          <View style={styles.statNoteBadge}>
            <Text style={styles.statNoteText}>
              🛡️ Sử dụng điểm khả dụng ({availableSpins} lượt) - Không trừ điểm tích lũy xét hạng
            </Text>
          </View>
        </View>

        {/* Cơ cấu giải thưởng */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy-outline" size={18} color="#c89a58" />
            <Text style={styles.sectionTitle}>CƠ CẤU GIẢI THƯỞNG</Text>
          </View>
          <View style={styles.prizesList}>
            {prizes.map((prize, idx) => (
              <View key={prize.id || idx} style={styles.prizeRowItem}>
                <View style={styles.prizeRowLeft}>
                  <View style={[styles.prizeDot, { backgroundColor: prize.mau || REFERENCE_8_PRIZES[idx % 8].mau }]} />
                  <View style={styles.prizeIconWrap}>
                    <Text style={{ fontSize: 14 }}>{prize.icon || '🎁'}</Text>
                  </View>
                  <Text style={styles.prizeRowName}>{formatPrizeDisplayName(prize)}</Text>
                </View>
                <Text style={styles.prizeRateText}>
                  Tỷ lệ: {prize.xac_suat != null ? `${prize.xac_suat}%` : 'Đồng đều'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Thể lệ tham gia */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={18} color="#b22830" />
            <Text style={styles.sectionTitle}>THỂ LỆ THAM GIA</Text>
          </View>
          <View style={styles.rulesList}>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" style={{ marginTop: 2 }} />
              <Text style={styles.ruleText}>Mỗi lượt quay tiêu tốn cố định {cost} điểm khả dụng.</Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" style={{ marginTop: 2 }} />
              <Text style={styles.ruleText}>Điểm tích lũy xét hạng thành viên (Gold, Diamond...) sẽ không bị ảnh hưởng khi quay.</Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" style={{ marginTop: 2 }} />
              <Text style={styles.ruleText}>Voucher trúng thưởng có giá trị sử dụng trong vòng 14 ngày kể từ khi nhận.</Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" style={{ marginTop: 2 }} />
              <Text style={styles.ruleText}>Món nước/topping uống thử: hệ thống tự động gửi voucher FREE_ITEM trực tiếp vào tài khoản của bạn để áp dụng khi tạo đơn hàng.</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResultModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalAccentBar} />

            <View style={styles.modalIconBadge}>
              <Text style={{ fontSize: 34 }}>{prizeResult?.giai_thuong?.icon || '🎁'}</Text>
            </View>

            <Text style={styles.modalTitle}>CHÚC MỪNG BẠN!</Text>
            <Text style={styles.modalSubtitle}>Bạn đã may mắn quay trúng phần quà:</Text>

            <View style={styles.modalPrizeBox}>
              <Text style={styles.modalPrizeName}>
                {formatPrizeDisplayName(prizeResult?.giai_thuong || prizeResult) || 'Phần thưởng may mắn'}
              </Text>
            </View>

            {prizeResult?.voucher_code ? (
              <View style={styles.modalVoucherBox}>
                <Text style={styles.modalVoucherLabel}>MÃ VOUCHER CỦA BẠN</Text>
                <Text style={styles.modalVoucherCode}>{prizeResult.voucher_code}</Text>
                <Text style={styles.modalVoucherNote}>Đã được thêm tự động vào danh sách ưu đãi của bạn.</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalSpinAgainBtn, pressed && { opacity: 0.9 }]}
                onPress={() => {
                  setShowResultModal(false)
                  setTimeout(() => {
                    handleSpin()
                  }, 300)
                }}
              >
                <Text style={styles.modalSpinAgainText}>QUAY TIẾP</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.9 }]}
                onPress={() => setShowResultModal(false)}
              >
                <Text style={styles.modalCloseText}>ĐÓNG</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbf9' },
  header: {
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', flex: 1 },
  content: { padding: 16, alignItems: 'center' },
  heroSection: { alignItems: 'center', marginBottom: 12, marginTop: 4 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  heroSubHeader: { fontSize: 10, fontWeight: '900', color: '#b22830', letterSpacing: 1.5 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#2b2b2b', letterSpacing: 0.5 },
  heroSubtitle: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center', paddingHorizontal: 16, lineHeight: 18 },

  wheelOuterContainer: {
    width: FRAME_SIZE + 20,
    height: FRAME_SIZE + 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    position: 'relative',
  },
  topPointerWrap: {
    position: 'absolute',
    top: -6,
    zIndex: 50,
    alignItems: 'center',
  },
  pointerCircleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8a1d24',
    borderWidth: 3,
    borderColor: '#c89a58',
    alignItems: 'center',
    justify: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  pointerStem: {
    width: 3,
    height: 8,
    backgroundColor: '#c89a58',
    marginTop: -2,
  },
  chocolateFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderRadius: FRAME_SIZE / 2,
    borderWidth: 12,
    borderColor: '#4a3728',
    backgroundColor: '#4a3728',
    alignItems: 'center',
    justify: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  innerGoldBorder: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: FRAME_SIZE - 12,
    height: FRAME_SIZE - 12,
    borderRadius: (FRAME_SIZE - 12) / 2,
    borderWidth: 3,
    borderColor: '#c89a58',
    pointerEvents: 'none',
  },
  dashedRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: FRAME_SIZE - 20,
    height: FRAME_SIZE - 20,
    borderRadius: (FRAME_SIZE - 20) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(200, 154, 88, 0.4)',
    borderStyle: 'dashed',
    pointerEvents: 'none',
  },
  wheelSvgContainer: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justify: 'center',
  },

  centerPinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -34,
    marginLeft: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    borderWidth: 3.5,
    borderColor: '#e5c189',
    alignItems: 'center',
    justify: 'center',
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
  },
  centerSpinBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justify: 'center',
  },
  centerSpinGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justify: 'center',
  },
  centerSpinText: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },

  statsCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    ...shadows.sm,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', marginBottom: 12 },
  statCol: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },
  statValueRed: { fontSize: 18, fontWeight: '900', color: '#b22830', marginTop: 2 },
  statValueGold: { fontSize: 18, fontWeight: '900', color: '#c89a58', marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#e5e7eb' },
  statNoteBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1, borderColor: '#a7f3d0' },
  statNoteText: { fontSize: 10, fontWeight: '700', color: '#047857', textAlign: 'center' },

  sectionCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    ...shadows.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#1f2937', letterSpacing: 0.5 },
  prizesList: { gap: 8 },
  prizeRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  prizeRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  prizeDot: { width: 8, height: 8, borderRadius: 4 },
  prizeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justify: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  prizeRowName: { fontSize: 12, fontWeight: '800', color: '#374151', flex: 1 },
  prizeRateText: { fontSize: 11, fontWeight: '700', color: '#9ca3af' },

  rulesList: { gap: 10 },
  ruleItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleText: { fontSize: 12, fontWeight: '600', color: '#4b5563', flex: 1, lineHeight: 18 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...shadows.lg,
  },
  modalAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#b22830',
  },
  modalIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justify: 'center',
    marginVertical: 12,
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1f2937', letterSpacing: 0.5 },
  modalSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 4, fontWeight: '600' },
  modalPrizeBox: {
    marginVertical: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  modalPrizeName: { fontSize: 15, fontWeight: '900', color: '#b22830', textAlign: 'center' },
  modalVoucherBox: {
    width: '100%',
    backgroundColor: '#fcfbf9',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 14,
  },
  modalVoucherLabel: { fontSize: 9, fontWeight: '800', color: '#9ca3af', letterSpacing: 0.5 },
  modalVoucherCode: {
    fontSize: 14,
    fontWeight: '900',
    color: '#b22830',
    marginTop: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
    letterSpacing: 1,
  },
  modalVoucherNote: { fontSize: 10, color: '#9ca3af', marginTop: 6, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  modalSpinAgainBtn: {
    flex: 1,
    backgroundColor: '#b22830',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSpinAgainText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  modalCloseBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: { color: '#374151', fontSize: 12, fontWeight: '800' },
})
