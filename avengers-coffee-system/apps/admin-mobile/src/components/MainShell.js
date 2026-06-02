import React, { useState } from 'react'
import { View, StyleSheet, Pressable, Platform, SafeAreaView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import { DrawerMenu } from './DrawerMenu'
import { AdminChatWidget } from './AdminChatWidget'
import { colors } from '../theme'

// Screens
import { DashboardScreen } from '../screens/DashboardScreen'
import { OrdersScreen } from '../screens/OrdersScreen'
import { InventoryScreen } from '../screens/InventoryScreen'
import { ShiftsScreen } from '../screens/ShiftsScreen'
import { WorkforceScreen } from '../screens/WorkforceScreen'
import { PosScreen } from '../screens/PosScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { ManagerWorkforceScreen } from '../screens/ManagerWorkforceScreen'
import { ManagerEmployeesScreen } from '../screens/ManagerEmployeesScreen'
import { CustomerCareScreen } from '../screens/CustomerCareScreen'
import { AdminSystemConsoleScreen } from '../screens/AdminSystemConsoleScreen'
import { NewsScreen } from '../screens/AdminNewsScreen'
import { AdminDashboardScreen } from '../screens/AdminDashboardScreen'
import { AdminUsersScreen } from '../screens/AdminUsersScreen'
import { AdminCustomersScreen } from '../screens/AdminCustomersScreen'
import { AdminBranchesScreen } from '../screens/AdminBranchesScreen'
import { AdminCategoriesScreen } from '../screens/AdminCategoriesScreen'
import { AdminPromotionsScreen } from '../screens/AdminPromotionsScreen'
import { AdminAnalyticsScreen } from '../screens/AdminAnalyticsScreen'
import { AdminSystemOpsScreen } from '../screens/AdminSystemOpsScreen'
import { AdminMenuScreen } from '../screens/AdminMenuScreen'

export function MainShell() {
  const { admin, sessionRole, sessionBranchCode, logout } = useAdmin()
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [activeTab, setActiveTab] = useState('Dashboard')

  // Shared Floating Menu Button for all screens
  const MenuButton = () => (
    <Pressable style={styles.menuBtn} onPress={() => setDrawerVisible(true)}>
      <Ionicons name="menu" size={26} color={colors.text} />
    </Pressable>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard': return sessionRole === 'ADMIN' ? <AdminDashboardScreen /> : <DashboardScreen />
      case 'Orders': return <OrdersScreen />
      case 'Inventory': return <InventoryScreen />
      case 'MenuAdmin': return <AdminMenuScreen />
      case 'Shifts': return <ShiftsScreen />
      case 'ShiftCheck': return <ShiftsScreen />
      case 'Workforce': return <WorkforceScreen />
      case 'POS': return <PosScreen />
      case 'Profile': return <ProfileScreen />
      case 'ManagerWorkforce': return <ManagerWorkforceScreen />
      case 'Employees': return <ManagerEmployeesScreen />
      case 'CustomerCare': return <CustomerCareScreen />
      case 'Users': return <AdminUsersScreen />
      case 'Customers': return <AdminCustomersScreen />
      case 'Branches': return <AdminBranchesScreen />
      case 'Categories': return <AdminCategoriesScreen />
      case 'Promotions': return <AdminPromotionsScreen />
      case 'Analytics': return <AdminAnalyticsScreen />
      case 'SystemConsole': return <AdminSystemOpsScreen />
      case 'News': return <NewsScreen />
      default: return sessionRole === 'ADMIN' ? <AdminDashboardScreen /> : <DashboardScreen />
    }
  }

  return (
    <View style={styles.container}>
      {renderContent()}
      
      {/* Floating Menu Button on top left */}
      <View style={styles.floatingHeader}>
        <MenuButton />
      </View>

      <DrawerMenu
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        admin={admin}
        sessionRole={sessionRole}
        branchCode={sessionBranchCode}
        onLogout={logout}
      />
      
      <AdminChatWidget admin={admin} sessionRole={sessionRole} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    zIndex: 100,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
})
