import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { colors, shadows } from '../theme'

const CARDS = [
  { id: '1', title: 'Thẻ Mùa Hè Rực Rỡ', price: 100000, value: 120000, colors: ['#f26b1d', '#c41230'] },
  { id: '2', title: 'Thẻ Cà Phê Đồng Đồng', price: 200000, value: 250000, colors: ['#3d1a08', '#f26b1d'] },
  { id: '3', title: 'Thẻ Tri Ân Khách Hàng VIP', price: 500000, value: 650000, colors: ['#fbbf24', '#d97706'] },
]

export function GiftCardScreen() {
  const navigation = useNavigation()
  const [selectedCard, setSelectedCard] = useState(CARDS[0])

  const handleBuy = () => {
    Alert.alert('Thành công', `Bạn đã chọn mua ${selectedCard.title} với giá ${selectedCard.price.toLocaleString('vi-VN')}đ. Đơn hàng GiftCard đã được chuyển sang giỏ hàng!`)
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0c05', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Thẻ Quà Tặng GiftCard</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Active Card Preview */}
        <LinearGradient colors={selectedCard.colors} style={styles.previewCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardBrand}>AVENGERS GIFT CARD</Text>
            <Ionicons name="gift-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>{selectedCard.title}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardValueLabel}>Hạn mức sử dụng</Text>
            <Text style={styles.cardValueText}>{selectedCard.value.toLocaleString('vi-VN')}đ</Text>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Chọn mệnh giá thẻ</Text>
        {CARDS.map((card) => (
          <Pressable
            key={card.id}
            onPress={() => setSelectedCard(card)}
            style={[styles.cardItem, selectedCard.id === card.id && styles.cardItemSelected]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardItemTitle}>{card.title}</Text>
              <Text style={styles.cardItemSub}>Giá bán: {card.price.toLocaleString('vi-VN')}đ (Giá trị {card.value.toLocaleString('vi-VN')}đ)</Text>
            </View>
            <Ionicons
              name={selectedCard.id === card.id ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selectedCard.id === card.id ? colors.primary : colors.muted}
            />
          </Pressable>
        ))}

        <Pressable onPress={handleBuy} style={styles.buyBtn}>
          <LinearGradient colors={['#f26b1d', '#c41230']} style={styles.buyBtnGradient}>
            <Text style={styles.buyBtnText}>MUA NGAY ({selectedCard.price.toLocaleString('vi-VN')}đ)</Text>
          </LinearGradient>
        </Pressable>
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
  previewCard: { height: 200, borderRadius: 24, padding: 24, justifyContent: 'space-between', marginBottom: 28, ...shadows.lg },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  cardTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  cardFooter: {},
  cardValueLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  cardValueText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  cardItem: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.borderLight, flexDirection: 'row', alignItems: 'center', ...shadows.sm },
  cardItemSelected: { borderColor: colors.primary, borderWidth: 2 },
  cardItemTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardItemSub: { fontSize: 12, color: colors.muted, marginTop: 4 },
  buyBtn: { marginTop: 24, borderRadius: 9999, overflow: 'hidden', ...shadows.primary },
  buyBtnGradient: { paddingVertical: 16, alignItems: 'center' },
  buyBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
})
