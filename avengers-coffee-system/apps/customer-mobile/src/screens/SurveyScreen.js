import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { colors, shadows } from '../theme'

export function SurveyScreen() {
  const navigation = useNavigation()
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    setSubmitted(true)
    Alert.alert('Cảm ơn bạn!', 'Ý kiến đóng góp của bạn đã được ghi nhận. Avengers Coffee chân thành cảm ơn!')
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0c05', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Khảo Sát Khách Hàng</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!submitted ? (
          <>
            <View style={styles.heroBox}>
              <Text style={styles.heroEmoji}>⭐</Text>
              <Text style={styles.heroTitle}>Đánh Giá Trải Nghiệm</Text>
              <Text style={styles.heroSub}>Ý kiến đóng góp của bạn giúp chúng tôi phục vụ tốt hơn mỗi ngày!</Text>
            </View>

            <View style={styles.ratingCard}>
              <Text style={styles.cardLabel}>Mức độ hài lòng của bạn:</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setRating(star)} style={{ padding: 4 }}>
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={36}
                      color={star <= rating ? '#f59e0b' : '#cbd5e1'}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.cardLabel}>Gợi ý hoặc ý kiến đóng góp khác:</Text>
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Nhập cảm nhận của bạn về món ăn, dịch vụ hoặc cửa hàng..."
                multiline
                numberOfLines={4}
                style={styles.textArea}
                textAlignVertical="top"
              />
            </View>

            <Pressable onPress={handleSubmit} style={styles.submitBtn}>
              <LinearGradient colors={['#f26b1d', '#c41230']} style={styles.btnGradient}>
                <Text style={styles.btnText}>GỬI ĐÁNH GIÁ</Text>
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={72} color="#10b981" />
            <Text style={styles.successTitle}>Cảm ơn bạn rất nhiều!</Text>
            <Text style={styles.successSub}>Ý kiến của bạn giúp Avengers Coffee ngày một hoàn thiện hơn.</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.backHomeBtn}>
              <Text style={styles.backHomeText}>Quay lại trang chủ</Text>
            </Pressable>
          </View>
        )}
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
  heroBox: { alignItems: 'center', marginBottom: 24 },
  heroEmoji: { fontSize: 44, marginBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  heroSub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },
  ratingCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  cardLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 },
  starsRow: { flexDirection: 'row', gap: 8 },
  inputCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  textArea: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, minHeight: 100, fontSize: 14 },
  submitBtn: { borderRadius: 9999, overflow: 'hidden', ...shadows.primary },
  btnGradient: { paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  successBox: { alignItems: 'center', paddingVertical: 48 },
  successTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 16 },
  successSub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 },
  backHomeBtn: { marginTop: 24, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 9999 },
  backHomeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
