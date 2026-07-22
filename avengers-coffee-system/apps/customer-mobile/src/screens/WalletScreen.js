import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserId } from '../lib/customerData'
import { colors } from '../theme'
import { LinearGradient } from 'expo-linear-gradient'

export function WalletScreen() {
  const navigation = useNavigation()
  const { user } = useUser()
  const userId = getUserId(user)
  const [amount, setAmount] = useState('')

  const { data: walletData, isLoading, refetch } = useQuery({
    queryKey: ['wallet', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/wallet`)
      return response.data
    },
    enabled: Boolean(userId),
    refetchOnWindowFocus: true
  })

  const topUpMutation = useMutation({
    mutationFn: async (topUpAmount) => {
      const response = await apiClient.post(`/customers/${userId}/wallet/topup`, {
        amount: Number(topUpAmount)
      })
      return response.data
    },
    onSuccess: (data) => {
      if (data.redirect_url) {
        Linking.openURL(data.redirect_url)
      } else {
        Alert.alert('Thành công', data.message || 'Nạp tiền thành công!')
        refetch()
        setAmount('')
      }
    },
    onError: (error) => {
      Alert.alert('Lỗi', error.response?.data?.message || 'Có lỗi xảy ra khi nạp tiền.')
    }
  })

  const handleTopUp = () => {
    const value = Number(amount)
    if (!value || value < 10000 || value > 5000000) {
      Alert.alert('Lỗi', 'Số tiền nạp phải từ 10,000đ đến 5,000,000đ.')
      return
    }
    topUpMutation.mutate(value)
  }

  const renderTransaction = (tx) => {
    const isTopUp = tx.type === 'TOP_UP'
    const Icon = isTopUp ? 'arrow-down-outline' : 'arrow-up-outline'
    const color = isTopUp ? '#2e7d32' : '#d32f2f'
    
    return (
      <View key={tx.id} style={styles.txItem}>
        <View style={[styles.txIconContainer, { backgroundColor: isTopUp ? '#e8f5e9' : '#ffebee' }]}>
          <Ionicons name={Icon} size={20} color={color} />
        </View>
        <View style={styles.txInfo}>
          <Text style={styles.txTitle}>{isTopUp ? 'Nạp tiền vào ví' : 'Thanh toán đơn hàng'}</Text>
          <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleString('vi-VN')}</Text>
        </View>
        <View style={styles.txAmountContainer}>
          <Text style={[styles.txAmount, { color }]}>
            {isTopUp ? '+' : '-'}{Number(tx.amount).toLocaleString('vi-VN')}đ
          </Text>
          <Text style={[styles.txStatus, { 
            color: tx.status === 'SUCCESS' ? '#2e7d32' : tx.status === 'PENDING' ? '#f57c00' : '#d32f2f',
            backgroundColor: tx.status === 'SUCCESS' ? '#e8f5e9' : tx.status === 'PENDING' ? '#fff3e0' : '#ffebee'
          }]}>
            {tx.status === 'SUCCESS' ? 'Thành công' : tx.status === 'PENDING' ? 'Đang chờ' : 'Thất bại'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ví điện tử</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <LinearGradient
              colors={['#ea8025', '#d16a1b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <Text style={styles.balanceLabel}>Số dư khả dụng</Text>
              <Text style={styles.balanceValue}>
                {Number(walletData?.wallet?.balance || 0).toLocaleString('vi-VN')} đ
              </Text>
              <View style={styles.cardDeco1} />
              <View style={styles.cardDeco2} />
            </LinearGradient>

            <View style={styles.topUpSection}>
              <Text style={styles.sectionTitle}>Nạp tiền vào ví</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.amountInput}
                  placeholder="Nhập số tiền cần nạp"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
                <Text style={styles.currencyLabel}>đ</Text>
              </View>
              <View style={styles.suggestedAmounts}>
                {[50000, 100000, 200000, 500000].map(val => (
                  <TouchableOpacity 
                    key={val} 
                    style={styles.suggestedChip}
                    onPress={() => setAmount(val.toString())}
                  >
                    <Text style={styles.suggestedText}>{val.toLocaleString('vi-VN')}đ</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity 
                style={[styles.topUpButton, topUpMutation.isPending && styles.topUpButtonDisabled]} 
                onPress={handleTopUp}
                disabled={topUpMutation.isPending}
              >
                {topUpMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.topUpButtonText}>NẠP QUA VNPAY</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.txSection}>
              <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
              {walletData?.transactions?.length > 0 ? (
                walletData.transactions.map(renderTransaction)
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="receipt-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>Chưa có giao dịch nào.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  balanceCard: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative'
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  cardDeco1: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cardDeco2: {
    position: 'absolute',
    right: 40,
    bottom: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  topUpSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  amountInput: {
    flex: 1,
    height: 50,
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  currencyLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#999',
  },
  suggestedAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  suggestedChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  suggestedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  topUpButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  topUpButtonDisabled: {
    opacity: 0.7,
  },
  topUpButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  txSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  txDate: {
    fontSize: 12,
    color: '#888',
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  txStatus: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  }
})
