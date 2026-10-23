import React from 'react'
import { View } from 'react-native'
import LeafletFrame from '../../../shared-ui/LeafletFrame.web'
import { coordinates } from '../../../web-customer/src/lib/locationModel'
export default function StoreMap({ branches, selected, onSelect }) {
  const points = branches.map(b => { const p=coordinates(b); return p ? { id:b.ma_chi_nhanh, latitude:p.lat,longitude:p.lng,kind:'store',label:b.ten_chi_nhanh } : null }).filter(Boolean)
  return <View style={{height:340,borderRadius:18,overflow:'hidden'}}><LeafletFrame title="Bản đồ cửa hàng" points={points} selectedId={selected?.ma_chi_nhanh} onSelect={id => onSelect?.(branches.find(b => String(b.ma_chi_nhanh)===id))} /></View>
}
