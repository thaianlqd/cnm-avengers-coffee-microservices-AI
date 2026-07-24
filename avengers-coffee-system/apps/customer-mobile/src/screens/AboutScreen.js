import React from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { colors, shadows } from '../theme'

export function AboutScreen() {
  const navigation = useNavigation()

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0c05', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Về Avengers Coffee</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroBox}>
          <Text style={styles.heroBrand}>AVENGERS COFFEE ☕</Text>
          <Text style={styles.heroTagline}>Hương vị đậm đà - Trải nghiệm đỉnh cao</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sứ mệnh của chúng tôi</Text>
          <Text style={styles.cardText}>
            Avengers Coffee sinh ra với mong muốn mang lại những tách cà phê thơm ngon đậm đà nhất cùng không gian ấm áp, thân thiện cho mọi khách hàng. Dù bạn cần một chỗ ngồi làm việc yên tĩnh hay một không gian gặp gỡ bạn bè, Avengers Coffee luôn đồng hành cùng bạn.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hạt Cà Phê Chất Lượng</Text>
          <Text style={styles.cardText}>
            Những hạt cà phê được chọn lọc kỹ lưỡng từ các vùng trồng nổi tiếng Tây Nguyên, nướng mộc chuẩn vị để từng giọt cà phê mang đậm hương vị Việt Nam nguyên bản.
          </Text>
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>© 2026 Avengers Coffee System. All rights reserved.</Text>
        </View>
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
  heroBox: { alignItems: 'center', marginBottom: 24, paddingVertical: 20 },
  heroBrand: { fontSize: 24, fontWeight: '900', color: colors.primary, letterSpacing: 1 },
  heroTagline: { fontSize: 14, color: colors.muted, marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  cardText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  footerNote: { alignItems: 'center', marginTop: 24, paddingBottom: 24 },
  footerText: { fontSize: 12, color: colors.muted },
})
