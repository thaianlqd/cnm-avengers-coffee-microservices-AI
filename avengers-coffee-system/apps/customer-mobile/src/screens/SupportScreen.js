import React from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { colors, shadows } from '../theme'

const FAQS = [
  { q: 'Làm sao để tích điểm khi mua hàng tại quầy?', a: 'Bạn chỉ cần đọc số điện thoại đã đăng ký hoặc mở mã Barcode trong mục Ví điểm trên ứng dụng cho nhân viên thu ngân quét.' },
  { q: 'Thời gian giao hàng trung bình là bao lâu?', a: 'Avengers Coffee cam kết giao hàng nhanh trong vòng 20 - 30 phút tính từ khi chi nhánh gần nhất tiếp nhận đơn.' },
  { q: 'Phương thức thanh toán nào được chấp nhận?', a: 'Hệ thống chấp nhận Tiền mặt khi nhận hàng (COD), Ví MoMo, ZaloPay, Chuyển khoản ngân hàng (QR VNPAY) và Điểm thưởng.' },
]

export function SupportScreen() {
  const navigation = useNavigation()

  const handleCall = () => {
    Linking.openURL('tel:18006936')
  }

  const handleEmail = () => {
    Linking.openURL('mailto:support@avengerscoffee.vn')
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0c05', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Hỗ Trợ & Trợ Giúp</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Contact Quick Action Buttons */}
        <View style={styles.contactRow}>
          <Pressable onPress={handleCall} style={styles.contactCard}>
            <View style={[styles.iconWrap, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="call-outline" size={24} color="#10b981" />
            </View>
            <Text style={styles.contactTitle}>Tổng đài 24/7</Text>
            <Text style={styles.contactValue}>1800 6936</Text>
          </Pressable>

          <Pressable onPress={handleEmail} style={styles.contactCard}>
            <View style={[styles.iconWrap, { backgroundColor: '#f0f9ff' }]}>
              <Ionicons name="mail-outline" size={24} color="#0ea5e9" />
            </View>
            <Text style={styles.contactTitle}>Gửi Email</Text>
            <Text style={styles.contactValue}>support@avengers...</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => navigation.navigate('Chat')} style={styles.chatCard}>
          <LinearGradient colors={['#f26b1d', '#c41230']} style={styles.chatCardGradient}>
            <Ionicons name="sparkles" size={26} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.chatCardTitle}>Trò chuyện với AI Support</Text>
              <Text style={styles.chatCardSub}>Giải đáp thắc mắc & trợ giúp đặt hàng tức thì</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        <Text style={styles.sectionTitle}>Câu hỏi thường gặp (FAQ)</Text>
        {FAQS.map((faq, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.faqQuestion}>Q: {faq.q}</Text>
            <Text style={styles.faqAnswer}>{faq.a}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  content: { padding: 20 },
  contactRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  contactCard: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 18, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  contactTitle: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  contactValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },
  chatCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 24, ...shadows.primary },
  chatCardGradient: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatCardTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  chatCardSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  faqCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  faqQuestion: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 6 },
  faqAnswer: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
})
