import React from 'react'
import { View } from 'react-native'
import LocationMap from '../../../web-customer/src/components/map/LocationMap'
export default function StoreMap({ branches, selected, onSelect }) {
  return <View style={{ height:340, borderRadius:18, overflow:'hidden' }}><LocationMap branches={branches} selected={selected || branches[0]} onSelect={onSelect} tileKey={process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY} /></View>
}
