import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing } from '../theme'

const { width } = Dimensions.get('window')
const DRAWER_WIDTH = Math.min(width * 0.75, 300)

export function DrawerMenu({ visible, onClose, activeTab, onNavigate, admin, sessionRole, branchCode }) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start()
    } else {
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, slideAnim])

  if (!visible) return null

  const role = String(sessionRole).toUpperCase()
  const isManager = role === 'MANAGER' || role === 'ADMIN'

  // Match exact web-admin menu
  const staffTabs = [
    { id: 'Dashboard', label: 'Tổng quan', icon: 'stats-chart-outline' },
    { id: 'Orders', label: 'Luồng đơn hàng', icon: 'receipt-outline' },
    { id: 'Inventory', label: 'Quản lý thực đơn', icon: 'restaurant-outline' },
    { id: 'News', label: 'Quản lý tin tức', icon: 'newspaper-outline' },
    { id: 'Shifts', label: 'Chốt ca', icon: 'time-outline' },
    { id: 'POS', label: 'POS tạo đơn nhanh', icon: 'calculator-outline' },
    { id: 'Workforce', label: isManager ? 'Lịch làm của tôi' : 'Lịch làm nhân sự', icon: 'calendar-outline' },
    { id: 'Profile', label: 'Hồ sơ & Bảo mật', icon: 'person-circle-outline' },
  ]

  const managerTabs = [
    { id: 'ShiftCheck', label: 'Kiểm tra chốt ca', icon: 'checkmark-done-outline' },
    { id: 'Employees', label: 'Quản lý nhân viên', icon: 'people-outline' },
    { id: 'ManagerWorkforce', label: 'Quản lý lịch làm nhân viên', icon: 'calendar-number-outline' },
    { id: 'CustomerCare', label: 'CSKH phản hồi đánh giá', icon: 'chatbubble-ellipses-outline' },
  ]

  const adminTabs = [
    { id: 'Dashboard', label: 'Dashboard tổng', icon: 'grid-outline' },
    { id: 'Users', label: 'Quản lý người dùng', icon: 'people-outline' },
    { id: 'Customers', label: 'Quản lý khách hàng', icon: 'heart-outline' },
    { id: 'Branches', label: 'Quản lý chi nhánh', icon: 'business-outline' },
    { id: 'Categories', label: 'Quản lý danh mục', icon: 'pricetag-outline' },
    { id: 'MenuAdmin', label: 'Quản lý menu tổng', icon: 'restaurant-outline' },
    { id: 'Profile', label: 'Hồ sơ & Bảo mật', icon: 'person-circle-outline' },
    { id: 'Promotions', label: 'Khuyến mãi & Voucher', icon: 'gift-outline' },
    { id: 'Analytics', label: 'Phân tích mua sắm', icon: 'bar-chart-outline' },
    { id: 'SystemConsole', label: 'Giám sát hệ thống', icon: 'pulse-outline' },
  ]

  const handlePress = (id) => {
    onNavigate(id)
    onClose()
  }

  const renderItem = (tab) => (
    <Pressable
      key={tab.id}
      onPress={() => handlePress(tab.id)}
      style={[styles.menuItem, activeTab === tab.id && styles.menuItemActive]}
    >
      <Ionicons
        name={tab.icon}
        size={20}
        color={activeTab === tab.id ? colors.primary : colors.muted}
        style={{ marginRight: 12 }}
      />
      <Text style={[styles.menuItemText, activeTab === tab.id && styles.menuItemTextActive]}>
        {tab.label}
      </Text>
    </Pressable>
  )

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.drawerContent}>
            <View style={styles.header}>
              <Text style={styles.brand}>Avengers Admin</Text>
              {role === 'ADMIN' ? (
                <Text style={styles.userTag}>Đang đăng nhập: {admin?.tenDangNhap || admin?.ho_ten || 'admin'} (ADMIN)</Text>
              ) : (
                <Text style={styles.userTag}>
                  Đang đăng nhập: {admin?.tenDangNhap || admin?.ho_ten || 'user'} ({role === 'MANAGER' ? 'Manager' : 'Staff'}) - Cơ sở {branchCode}
                </Text>
              )}
            </View>
            <Animated.ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {role === 'ADMIN' ? (
                <>
                  <Text style={styles.groupTitle}>System Admin</Text>
                  {adminTabs.map(renderItem)}
                </>
              ) : (
                <>
                  <Text style={styles.groupTitle}>Chức năng cho staff</Text>
                  {staffTabs.map(renderItem)}
                  
                  {role === 'MANAGER' && (
                    <>
                      <Text style={[styles.groupTitle, { color: colors.primary, marginTop: 16 }]}>
                        Chức năng dành cho manager
                      </Text>
                      {managerTabs.map(renderItem)}
                    </>
                  )}
                </>
              )}
              <View style={{ height: 40 }} />
            </Animated.ScrollView>
            <View style={styles.footer}>
              <Pressable style={styles.logoutBtn} onPress={() => {}}>
                <Text style={styles.logoutText}>Đăng xuất</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  drawerContent: {
    flex: 1,
    backgroundColor: '#0f172a', // Dark blue background exactly like web-admin sidebar
  },
  header: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  brand: { fontSize: 22, fontWeight: '900', color: colors.card, letterSpacing: -0.5 },
  userTag: { fontSize: 12, color: '#94a3b8', marginTop: 8, lineHeight: 18 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  menuItemActive: {
    backgroundColor: '#0ea5e9', // Blue background for active tab
    borderRightWidth: 3,
    borderRightColor: '#38bdf8',
  },
  menuItemText: { fontSize: 14, fontWeight: '600', color: '#cbd5e1' },
  menuItemTextActive: { color: '#ffffff', fontWeight: '800' },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  logoutBtn: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  logoutText: { color: colors.card, fontWeight: '700', fontSize: 14 },
})
