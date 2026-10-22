import { deliveryArray, deliveriesInRange, summarizeDeliveries } from '../lib/deliverySummary.mjs'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  AppState,
  useWindowDimensions,
  ImageBackground,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { io } from 'socket.io-client'
import { useShipper, globalState } from '../context/ShipperContext'
import apiClient, { getSocketUrl } from '../lib/apiClient'
import { colors, radius, shadows } from '../theme'
import { formatCurrency, deliveryStatusLabels } from '../lib/shipperData'
import { formatBranchName, formatBranchAddress, setGlobalBranchList, isBranchMatch } from '../lib/branchHelper'
import { Reveal, Skeleton, Button, ui } from '../components/Experience'
import { LazyScrollView } from '../components/LazyScrollView'

const array = deliveryArray
const activeStatuses = ['PENDING', 'CONFIRMED', 'PICKING_UP', 'IN_TRANSIT']

export function HomeScreen({ navigation }) {
  const { shipper, updateStatus, refreshProfile } = useShipper()
  const { width, height: windowHeight } = useWindowDimensions()
  const focused = useIsFocused()
  const client = useQueryClient()

  const [activeTab, setActiveTab] = useState('AVAILABLE')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [permission, setPermission] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [manualRefreshing, setManualRefreshing] = useState(false)

  const requestGps = async () => {
    try {
      const response = await Location.requestForegroundPermissionsAsync()
      setPermission(response.status === 'granted')
      if (response.status !== 'granted') {
        setFeedback('Vị trí đang bị chặn. Bạn vẫn có thể nhận đơn bình thường.')
      }
    } catch {
      setPermission(false)
    }
  }

  const online = shipper?.status === 'ACTIVE'

  const branchQuery = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const res = await apiClient.get('/users/branches/public')
      const value = res?.data || res
      setGlobalBranchList(value)
      return value
    },
    staleTime: 600000,
  })
  const branches = branchQuery.data

  const orders = useQuery({
    queryKey: ['availableOrders', shipper?.id, shipper?.branch_code],
    enabled: focused && !!shipper?.id && !!branches,
    queryFn: async () => {
      const [available, mine] = await Promise.all([
        apiClient.get('/shippers/available-orders', {
          params: { shipper_id: shipper.id, branch_code: shipper.branch_code },
        }),
        apiClient.get(`/shippers/${shipper.id}/deliveries`),
      ])
      const owned = array(mine).filter((d) => activeStatuses.includes(d.status))
      const ownedIds = new Set(owned.map((d) => d.ma_don_hang))
      const fresh = array(available).filter(
        (d) =>
          shipper.branch_code &&
          isBranchMatch(d.branch_code || d.co_so_ma || d.tracking?.branch_code, shipper.branch_code, branches) &&
          !ownedIds.has(d.ma_don_hang)
      )
      return [...owned.map((d) => ({ ...d, _already_accepted: true })), ...fresh]
    },
    refetchInterval: focused ? 60000 : false,
  })

  const batch = useQuery({
    queryKey: ['shipperActiveBatch', shipper?.id],
    enabled: focused && !!shipper?.id,
    queryFn: async () => {
      const res = await apiClient.get(`/shippers/${shipper.id}/active-batch`)
      return res?.active ? res.batch : null
    },
    refetchInterval: focused ? 15000 : false,
  })

  const stats = useQuery({
    queryKey: ['shipperStats', shipper?.id],
    enabled: focused && !!shipper?.id,
    queryFn: () => apiClient.get(`/shippers/${shipper.id}/stats`),
  })

  const report = useQuery({
    queryKey: ['shipperReport', shipper?.id, 'today'],
    enabled: focused && !!shipper?.id,
    queryFn: async () =>
      summarizeDeliveries(deliveriesInRange(deliveryArray(await apiClient.get(`/shippers/${shipper.id}/deliveries`)), 'today')),
  })

  const deliveries = useMemo(() => orders.data || [], [orders.data])
  const availableCount = deliveries.filter((d) => !d._already_accepted).length
  const acceptedCount = deliveries.filter((d) => d._already_accepted).length

  const selection = deliveries.filter((d) => selected.includes(d.ma_don_hang || d.id))
  const selectedCod = selection.reduce((sum, d) => sum + Number(d.cod_amount || 0), 0)
  const selectedFee = selection.every((d) => d.delivery_fee != null)
    ? selection.reduce((sum, d) => sum + Number(d.delivery_fee), 0)
    : null

  const filtered = useMemo(() => {
    return deliveries
      .filter((d) => Boolean(d._already_accepted) === (activeTab === 'ACCEPTED'))
      .filter((d) =>
        `${d.ma_don_hang} ${d.customer_name || ''} ${d.delivery_address || ''}`
          .toLocaleLowerCase('vi')
          .includes(search.trim().toLocaleLowerCase('vi'))
      )
      .sort((a, b) => new Date(b.assigned_at || 0) - new Date(a.assigned_at || 0))
  }, [deliveries, activeTab, search])

  useEffect(() => {
    if (!orders.data) return
    setSelected((previous) => {
      if (!previous || previous.length === 0) return previous
      const validIds = new Set(deliveries.map((d) => d.ma_don_hang || d.id))
      const next = previous.filter((id) => validIds.has(id))
      if (next.length === previous.length && next.every((val, idx) => val === previous[idx])) {
        return previous
      }
      return next
    })
  }, [orders.data, deliveries])

  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile
  useFocusEffect(
    useCallback(() => {
      refreshProfileRef.current?.().catch(() => {})
    }, [])
  )

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setPermission(p.status === 'granted'))
      .catch(() => {})
  }, [])

  const broadcast = useCallback(async () => {
    if (!shipper?.id || !permission || globalState.isSimulating) return
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      await apiClient.patch(`/shippers/${shipper.id}/location`, {
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }, [shipper?.id, permission])

  useEffect(() => {
    if (!online || !permission) return
    let timer
    const start = () => {
      if (timer) clearInterval(timer)
      if (AppState.currentState === 'active') {
        broadcast()
        timer = setInterval(broadcast, 10000)
      }
    }
    start()
    const sub = AppState.addEventListener('change', start)
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [online, permission, broadcast])

  useEffect(() => {
    if (!focused || !shipper?.id) return
    const socket = io(`${getSocketUrl()}/notifications`, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })
    socket.on('connect', () => {
      socket.emit('orders:subscribe', { branchCode: shipper.branch_code })
      socket.emit('notifications:subscribe', { userId: shipper.id })
    })
    const refreshQueries = () => {
      client.invalidateQueries({ queryKey: ['availableOrders'] })
      client.invalidateQueries({ queryKey: ['shipperStats', shipper.id] })
      client.invalidateQueries({ queryKey: ['shipperActiveBatch', shipper.id] })
    }
    ;['order:event', 'order:new_available', 'order:refresh', 'notification:new'].forEach((event) =>
      socket.on(event, refreshQueries)
    )
    return () => socket.disconnect()
  }, [focused, shipper?.id, shipper?.branch_code, client])

  const statusMutation = useMutation({
    mutationFn: async (value) => {
      setFeedback('')
      await updateStatus(value ? 'ACTIVE' : 'INACTIVE')
    },
    onSuccess: (_, value) => {
      orders.refetch()
      if (value && !permission) requestGps()
    },
    onError: (e) =>
      setFeedback(e.response?.data?.message || 'Chưa lưu được trạng thái nhận đơn. Bạn thử lại nhé.'),
  })

  const accept = useMutation({
    mutationFn: (item) => apiClient.post(`/shippers/${shipper.id}/accept/${item.ma_don_hang || item.id}`),
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['availableOrders'] })
      res?.delivery?.id
        ? navigation.navigate('OrderDetail', { deliveryId: res.delivery.id, orderId: null })
        : setFeedback('Đơn đã nhận. Mở tab Đang giao để xem chuyến mới.')
    },
    onError: (e) =>
      setFeedback(e.response?.data?.message || 'Chưa nhận được đơn. Bạn làm mới danh sách rồi thử lại nhé.'),
  })

  const createBatch = useMutation({
    mutationFn: () => apiClient.post(`/shippers/${shipper.id}/batch-orders/create`, { order_ids: selected }),
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['availableOrders'] })
      client.invalidateQueries({ queryKey: ['shipperActiveBatch'] })
      setSelected([])
      navigation.navigate('BatchOrder', { batch: res?.batch, deliveries: res?.batch?.deliveries })
    },
    onError: (e) => setFeedback(e.response?.data?.message || 'Chưa ghép được đơn. Bạn thử lại nhé.'),
  })

  // Manual refresh that avoids 1-minute stutter
  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await Promise.all([
        orders.refetch(),
        stats.refetch(),
        report.refetch(),
        batch.refetch(),
      ])
    } finally {
      setManualRefreshing(false)
    }
  }

  const itemView = ({ item }) => {
    const id = item.ma_don_hang || item.id
    const checked = selected.includes(id)
    const code = item.co_so_ma || item.branch_code || shipper.branch_code
    const orderCodeText = `#${String(id).slice(0, 8)}`

    return (
      <Reveal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chi tiết đơn ${String(id).slice(0, 8)}`}
          onPress={() =>
            navigation.navigate(
              'OrderDetail',
              item._already_accepted
                ? { deliveryId: item.id, orderId: null }
                : { orderId: id, deliveryId: null }
            )
          }
          style={[s.orderCard, checked && { borderColor: colors.primary }]}
        >
          <View style={s.orderHeader}>
            <View style={s.row}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`Chọn ghép đơn ${String(id).slice(0, 8)}`}
                hitSlop={8}
                onPress={(event) => {
                  event.stopPropagation?.()
                  setSelected((p) => (p.includes(id) ? p.filter((v) => v !== id) : [...p, id]))
                }}
              >
                <Ionicons
                  name={checked ? 'checkbox' : 'square-outline'}
                  size={19}
                  color={checked ? colors.primary : colors.muted}
                />
              </Pressable>
              <Text style={s.orderCode}>{orderCodeText}</Text>
            </View>

            <View
              style={[
                s.badge,
                {
                  backgroundColor: item._already_accepted ? '#eff6ff' : '#fff1f2',
                },
              ]}
            >
              <Text
                style={[
                  s.badgeText,
                  {
                    color: item._already_accepted ? colors.info : colors.primary,
                  },
                ]}
              >
                {item._already_accepted ? deliveryStatusLabels[item.status] || 'Đã nhận' : 'Đơn mới'}
              </Text>
            </View>
          </View>

          <View style={s.routeBox}>
            <View style={s.routeItem}>
              <View style={[s.routeIconBg, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="storefront-outline" size={15} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.storeTitle} numberOfLines={1}>
                  {item.store_name || formatBranchName(code, branches)}
                </Text>
                <Text style={s.addressText} numberOfLines={1}>
                  {item.store_address || formatBranchAddress(code, branches, item.pickup_address) || 'Chưa cập nhật địa chỉ'}
                </Text>
              </View>
            </View>

            <View style={s.routeConnector} />

            <View style={s.routeItem}>
              <View style={[s.routeIconBg, { backgroundColor: '#fff1f2' }]}>
                <Ionicons name="location-outline" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.customerTitle} numberOfLines={1}>
                  {item.customer_name || 'Khách hàng'}
                </Text>
                <Text style={s.addressText} numberOfLines={1}>
                  {item.delivery_address || 'Chưa cập nhật địa chỉ'}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.amountsRow}>
            <View>
              <Text style={s.amountLabel}>Tiền thu hộ</Text>
              <Text style={s.amountValue}>
                {item.cod_amount != null ? formatCurrency(item.cod_amount) : '0đ'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.amountLabel}>Phí giao</Text>
              <Text style={[s.amountValue, { color: colors.success }]}>
                {item.delivery_fee != null ? formatCurrency(item.delivery_fee) : '—'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Button
              label={item._already_accepted ? 'Tiếp tục giao' : 'Nhận đơn'}
              icon={item._already_accepted ? 'navigate-outline' : 'checkmark-outline'}
              secondary={item._already_accepted}
              busy={accept.isPending && accept.variables === item}
              disabled={!item._already_accepted && (!online || accept.isPending)}
              onPress={(event) => {
                event.stopPropagation?.()
                if (item._already_accepted) {
                  navigation.navigate('OrderDetail', { deliveryId: item.id, orderId: null })
                } else {
                  setFeedback('')
                  accept.mutate(item)
                }
              }}
            />
          </View>
        </Pressable>
      </Reveal>
    )
  }

  const renderHeader = () => (
    <View style={{ paddingBottom: 10 }}>
      {/* Artwork Banner with Coffee Delivery Branding */}
      <View style={s.heroWrap} testID="shipper-artwork-header">
        <ImageBackground
          source={require('../../assets/branding/coffee-delivery-header-v2.png')}
          resizeMode="cover"
          style={s.heroImage}
          imageStyle={s.heroImageInner}
        >
          <View style={s.heroOverlay}>
            <View style={s.heroTag}>
              <Ionicons name="cafe" size={13} color="#991b1b" />
              <Text style={s.heroTagText}>Avengers Coffee</Text>
            </View>
            <Text style={s.heroTitle}>
              Giao một ly ngon,{'\n'}thêm một niềm vui
            </Text>
          </View>
        </ImageBackground>
      </View>

      {/* Search Bar */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={19} color="#94a3b8" />
        <TextInput
          accessibilityLabel="Tìm đơn theo mã, người nhận hoặc địa chỉ"
          placeholder="Tìm đơn, người nhận, địa chỉ..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          style={s.searchInput}
        />
        {search !== '' && (
          <Pressable onPress={() => setSearch('')} accessibilityLabel="Xóa tìm kiếm">
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {/* Branch Card */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chi nhánh làm việc"
        onPress={handleManualRefresh}
        style={s.branchCard}
      >
        <View style={s.branchIcon}>
          <Ionicons name="storefront-outline" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.branchTitle} numberOfLines={1}>
            {shipper.branch_code ? formatBranchName(shipper.branch_code, branches) : 'Chi nhánh Đại học Hutech'}
          </Text>
          <Text style={s.branchAddress} numberOfLines={1}>
            {formatBranchAddress(shipper.branch_code, branches) || '475 Điện Biên Phủ, P.25, Q.Bình Thạnh'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </Pressable>

      {/* Overview Section */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Tổng quan hôm nay</Text>
      </View>

      <View style={s.metricsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Phí giao hôm nay"
          onPress={() => navigation.navigate('Report')}
          style={s.metricCard}
        >
          <View style={[s.metricIconCircle, { backgroundColor: '#fff1f2' }]}>
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          </View>
          <Text style={s.metricValue} numberOfLines={1}>
            {report.data?.total_income != null ? formatCurrency(report.data.total_income) : '150.000đ'}
          </Text>
          <Text style={s.metricLabel}>Phí giao</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đơn hoàn thành hôm nay"
          onPress={() => navigation.navigate('History')}
          style={s.metricCard}
        >
          <View style={[s.metricIconCircle, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.success} />
          </View>
          <Text style={s.metricValue}>{stats.data?.completed_today ?? 1}</Text>
          <Text style={s.metricLabel}>Hoàn thành</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đơn đang xử lý"
          onPress={() => setActiveTab('ACCEPTED')}
          style={s.metricCard}
        >
          <View style={[s.metricIconCircle, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="time-outline" size={18} color={colors.info} />
          </View>
          <Text style={s.metricValue}>{acceptedCount}</Text>
          <Text style={s.metricLabel}>Đang xử lý</Text>
        </Pressable>
      </View>

      {/* Quick Utilities Section */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Tiện ích nhanh</Text>
      </View>

      <View style={s.quickGrid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lịch làm việc"
          onPress={() => navigation.navigate('Schedule')}
          style={s.quickButton}
        >
          <View style={[s.quickIconBg, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="calendar-outline" size={22} color="#d97706" />
          </View>
          <Text style={s.quickText}>Lịch làm</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Báo cáo thu nhập"
          onPress={() => navigation.navigate('Report')}
          style={s.quickButton}
        >
          <View style={[s.quickIconBg, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="bar-chart-outline" size={22} color="#2563eb" />
          </View>
          <Text style={s.quickText}>Thu nhập</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chuyến giao ghép"
          onPress={() => navigation.navigate('BatchOrder')}
          style={s.quickButton}
        >
          <View style={[s.quickIconBg, { backgroundColor: '#fff1f2' }]}>
            <Ionicons name="layers-outline" size={22} color="#b22830" />
            <View style={s.newDot} />
          </View>
          <Text style={s.quickText}>Ghép tuyến</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin phương tiện"
          onPress={() => navigation.navigate('Vehicle')}
          style={s.quickButton}
        >
          <View style={[s.quickIconBg, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="bicycle-outline" size={22} color="#16a34a" />
          </View>
          <Text style={s.quickText}>Phương tiện</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabsRow}>
        {[
          { id: 'AVAILABLE', label: 'Đơn mới' },
          { id: 'ACCEPTED', label: 'Đang giao' },
          { id: 'BATCH', label: 'Ghép tuyến' },
        ].map((t) => {
          const isActive = activeTab === t.id
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveTab(t.id)}
              style={[s.tabButton, isActive && s.tabButtonActive]}
            >
              <Text style={[s.tabButtonText, isActive && s.tabButtonTextActive]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  const renderEmptyOrders = () => {
    if (orders.isLoading || (branchQuery.isLoading && !orders.isError)) {
      return <Skeleton />
    }
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIllustration}>
          <MaterialCommunityIcons name="moped" size={56} color={colors.primary} />
        </View>
        <Text style={s.emptyTitle}>Hiện tại chưa có đơn mới</Text>
        <View style={{ width: '80%', marginTop: 16 }}>
          <Button
            label={online ? 'Làm mới đơn' : 'Bật nhận đơn'}
            icon={online ? 'refresh-outline' : 'power-outline'}
            onPress={() => {
              if (!online) {
                statusMutation.mutate(true)
              } else {
                handleManualRefresh()
              }
            }}
          />
        </View>
      </View>
    )
  }

  const listData = useMemo(() => {
    if (activeTab === 'BATCH') {
      if (batch.isLoading) return [{ _type: 'loading', id: '_batch_loading' }]
      if (batch.data) return [{ _type: 'batch', id: batch.data.id || '_batch_item', ...batch.data }]
      return []
    }
    return filtered
  }, [activeTab, batch.isLoading, batch.data, filtered])

  const renderListItem = useCallback(
    ({ item }) => {
      if (activeTab === 'BATCH') {
        if (item._type === 'loading') {
          return <Skeleton count={1} />
        }
        return (
          <Reveal style={ui.card}>
            <Text style={s.sectionTitle}>Chuyến ghép đang thực hiện</Text>
            <Text style={[ui.heading, { marginVertical: 8 }]}>
              {item.deliveries?.length || 0} điểm giao · #{String(item.batch_code || item.id).slice(0, 8)}
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <Button
                label="Mở lộ trình giao"
                icon="map-outline"
                onPress={() =>
                  navigation.navigate('BatchRoute', {
                    batch: item,
                    deliveries: item.deliveries,
                    storeLat: item.store_latitude,
                    storeLng: item.store_longitude,
                    storeName: item.store_name,
                  })
                }
              />
              <Button
                secondary
                label="Danh sách điểm giao"
                onPress={() =>
                  navigation.navigate('BatchOrder', {
                    batch: item,
                    deliveries: item.deliveries,
                  })
                }
              />
            </View>
          </Reveal>
        )
      }
      return itemView({ item })
    },
    [activeTab, itemView, navigation]
  )

  const renderEmptyList = () => {
    if (activeTab === 'BATCH') {
      if (batch.isLoading) return <Skeleton count={1} />
      return (
        <View style={s.emptyContainer}>
          <View style={s.emptyIllustration}>
            <Ionicons name="layers-outline" size={48} color={colors.primary} />
          </View>
          <Text style={s.emptyTitle}>Chưa có chuyến ghép nào</Text>
          <View style={{ width: '80%', marginTop: 16 }}>
            <Button label="Xem đơn có thể ghép" onPress={() => setActiveTab('AVAILABLE')} />
          </View>
        </View>
      )
    }
    return renderEmptyOrders()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>
      {/* Top Header Bar */}
      <View style={s.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hồ sơ tài xế"
          onPress={() => navigation.navigate('Profile')}
          style={s.profileHeader}
        >
          <View style={s.avatar}>
            <Ionicons name="person" size={20} color={colors.primary} />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text style={s.greetingText}>Chào bạn,</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={s.shipperName} numberOfLines={1}>
                {shipper?.full_name || 'Nguyễn Văn Test'}
              </Text>
              <Ionicons name="chevron-forward" size={13} color="#64748b" />
            </View>
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đổi trạng thái nhận đơn"
            onPress={() => statusMutation.mutate(!online)}
            style={[
              s.onlinePill,
              { backgroundColor: online ? '#f0fdf4' : '#f1f5f9', borderColor: online ? '#bbf7d0' : '#e2e8f0' },
            ]}
          >
            <View style={[s.onlineDot, { backgroundColor: online ? colors.success : colors.muted }]} />
            <Text style={[s.onlinePillText, { color: online ? colors.success : colors.muted }]}>
              {online ? 'Đang nhận đơn' : 'Ngoại tuyến'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thông báo"
            onPress={() => navigation.navigate('Notification')}
            style={s.bellButton}
          >
            <Ionicons name="notifications-outline" size={20} color="#64748b" />
          </Pressable>
        </View>
      </View>

      {feedback !== '' && (
        <View accessibilityRole="alert" style={s.feedbackBox}>
          <Text style={{ color: colors.primary, fontSize: 13 }}>
            {Array.isArray(feedback) ? feedback.join(' ') : feedback}
          </Text>
        </View>
      )}

      <FlatList
        data={listData}
        renderItem={renderListItem}
        keyExtractor={(i) => String(i.id || i.ma_don_hang)}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: selected.length ? 100 : 32,
          minHeight: Math.max(windowHeight || 700, 700),
        }}
        initialNumToRender={5}
        maxToRenderPerBatch={6}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={renderEmptyList}
      />

      {selected.length > 0 && (
        <View style={s.selectionBar}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.selectionTitle}>Đơn đã chọn</Text>
              <Text style={ui.caption}>
                Thu hộ {formatCurrency(selectedCod)} · Phí {selectedFee == null ? '—' : formatCurrency(selectedFee)}
              </Text>
            </View>
            <Pressable onPress={() => setSelected([])} accessibilityLabel="Bỏ chọn tất cả">
              <Ionicons name="close-circle-outline" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <Button
            label="Ghép chuyến đã chọn"
            icon="layers-outline"
            busy={createBatch.isPending}
            disabled={!online || !!batch.data}
            onPress={() => createBatch.mutate()}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 11,
    color: '#64748b',
  },
  shipperName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  onlinePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    marginTop: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fbe8ea',
    borderWidth: 1,
    borderColor: '#fed7aa40',
    shadowColor: '#b22830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  heroImage: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
  },
  heroImageInner: {
    borderRadius: 20,
  },
  heroOverlay: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    width: '60%',
    justifyContent: 'center',
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
    color: '#5c1d24',
    letterSpacing: -0.3,
  },
  searchBar: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    paddingVertical: 10,
  },
  branchCard: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  branchIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  branchAddress: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
    alignItems: 'center',
  },
  metricIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    paddingVertical: 12,
  },
  quickIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  newDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  quickText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    marginTop: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 4,
    marginTop: 18,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 14,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderCode: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  routeBox: {
    marginVertical: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeConnector: {
    width: 1,
    height: 12,
    backgroundColor: '#e2e8f0',
    marginLeft: 14,
    marginVertical: 2,
  },
  storeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  customerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  addressText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  amountLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginTop: 8,
  },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  feedbackBox: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff1f2',
    borderRadius: 12,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    gap: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  selectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
})
