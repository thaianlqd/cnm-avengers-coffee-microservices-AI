import React, { useState, useEffect } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Linking, Platform } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'

const STORE_LAT = 10.762622
const STORE_LNG = 106.660172

function formatETA(distanceKm) {
  // Average 30km/h in city
  const minutes = Math.round((distanceKm / 30) * 60)
  if (minutes < 1) return '< 1 phút'
  if (minutes < 60) return `~${minutes} phút`
  return `~${Math.floor(minutes / 60)}h ${minutes % 60}p`
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function MapScreen({ route, navigation }) {
  const { delivery } = route.params
  const { shipper } = useShipper()
  const [location, setLocation] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [distance, setDistance] = useState(null)

  const destLat = delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : STORE_LAT + 0.02
  const destLng = delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : STORE_LNG + 0.02

  useEffect(() => {
    let sub = null
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setErrorMsg('Cần quyền truy cập vị trí')
        return
      }
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLocation(initial)
      const d = calcDistance(initial.coords.latitude, initial.coords.longitude, destLat, destLng)
      setDistance(d)

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
        (newLoc) => {
          setLocation(newLoc)
          const newD = calcDistance(newLoc.coords.latitude, newLoc.coords.longitude, destLat, destLng)
          setDistance(newD)
          if (shipper?.id) {
            apiClient.patch(`/shippers/${shipper.id}/location`, {
              latitude: newLoc.coords.latitude,
              longitude: newLoc.coords.longitude,
            }).catch(() => {})
          }
        }
      )
    })()
    return () => { if (sub) sub.remove() }
  }, [])

  const openExternalNav = () => {
    const address = encodeURIComponent(delivery?.delivery_address || '')
    const googleUrl = `https://maps.google.com/maps?daddr=${address}`
    const appleUrl = `maps:?daddr=${address}`
    const url = Platform.OS === 'ios' ? appleUrl : googleUrl
    Linking.openURL(url).catch(() => Linking.openURL(googleUrl))
  }

  const callCustomer = () => {
    const phone = delivery?.customer_phone
    if (!phone) return
    Linking.openURL(`tel:${phone}`)
  }

  const mapRegion = {
    latitude: location?.coords.latitude || STORE_LAT,
    longitude: location?.coords.longitude || STORE_LNG,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={mapRegion} showsUserLocation showsMyLocationButton>
        {/* Store Marker */}
        <Marker coordinate={{ latitude: STORE_LAT, longitude: STORE_LNG }} title="Cửa hàng Avengers" description="Lấy hàng tại đây">
          <View style={styles.markerStore}>
            <Ionicons name="storefront" size={20} color={colors.surface} />
          </View>
        </Marker>

        {/* Destination Marker */}
        <Marker coordinate={{ latitude: destLat, longitude: destLng }} title="Khách hàng" description={delivery?.delivery_address}>
          <View style={styles.markerDest}>
            <Ionicons name="location" size={24} color={colors.surface} />
          </View>
        </Marker>

        {/* Shipper position line */}
        {location && (
          <Polyline
            coordinates={[
              { latitude: location.coords.latitude, longitude: location.coords.longitude },
              { latitude: destLat, longitude: destLng },
            ]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[10, 5]}
          />
        )}
      </MapView>

      {/* Header overlay */}
      <SafeAreaView style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Bản đồ điều hướng</Text>
            <Text style={styles.headerSub}>#{delivery?.ma_don_hang?.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Footer Panel */}
      <View style={styles.footerPanel}>
        {/* ETA row */}
        {distance !== null && (
          <View style={styles.etaRow}>
            <View style={styles.etaItem}>
              <Ionicons name="navigate" size={18} color={colors.primary} />
              <Text style={styles.etaValue}>{distance.toFixed(1)} km</Text>
              <Text style={styles.etaLabel}>Quãng đường</Text>
            </View>
            <View style={styles.etaDivider} />
            <View style={styles.etaItem}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.etaValue}>{formatETA(distance)}</Text>
              <Text style={styles.etaLabel}>Thời gian dự kiến</Text>
            </View>
          </View>
        )}

        <View style={styles.addressBox}>
          <Ionicons name="location" size={22} color={colors.danger} />
          <View style={styles.addressContent}>
            <Text style={styles.addressLabel}>Giao đến:</Text>
            <Text style={styles.addressValue} numberOfLines={2}>
              {delivery?.delivery_address || 'Địa chỉ khách hàng'}
            </Text>
          </View>
        </View>

        {errorMsg && <Text style={styles.errText}>{errorMsg}</Text>}

        <View style={styles.actionBtns}>
          <TouchableOpacity style={[styles.fab, { flex: 1, marginRight: 8 }]} onPress={openExternalNav}>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.fabText}>Mở Google Maps</Text>
          </TouchableOpacity>
          {delivery?.customer_phone && (
            <TouchableOpacity style={[styles.fab, { backgroundColor: colors.success, width: 48 }]} onPress={callCustomer}>
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, padding: spacing.sm, margin: spacing.md,
    borderRadius: radius.lg, ...shadows.sm,
  },
  backBtn: { padding: spacing.sm },
  headerInfo: { alignItems: 'center' },
  headerTitle: { ...typography.bodyBold, color: colors.text },
  headerSub: { ...typography.caption, color: colors.primary },
  markerStore: {
    backgroundColor: colors.primary, padding: 8, borderRadius: 20,
    borderWidth: 2, borderColor: colors.surface, ...shadows.sm,
  },
  markerDest: {
    backgroundColor: colors.danger, padding: 6, borderRadius: 20,
    borderWidth: 2, borderColor: colors.surface, ...shadows.sm,
  },
  footerPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadows.lg,
  },
  etaRow: {
    flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, alignItems: 'center',
  },
  etaItem: { flex: 1, alignItems: 'center' },
  etaValue: { ...typography.h4, color: colors.text, marginTop: 4 },
  etaLabel: { ...typography.caption, color: colors.muted },
  etaDivider: { width: 1, height: 40, backgroundColor: colors.borderLight },
  addressBox: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  addressContent: { marginLeft: spacing.md, flex: 1 },
  addressLabel: { ...typography.caption, color: colors.textSecondary },
  addressValue: { ...typography.bodyBold, color: colors.text, marginTop: 4 },
  errText: { color: colors.danger, fontSize: 12, marginBottom: spacing.sm },
  actionBtns: { flexDirection: 'row', alignItems: 'center' },
  fab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: radius.lg, gap: 8, ...shadows.sm,
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
})
