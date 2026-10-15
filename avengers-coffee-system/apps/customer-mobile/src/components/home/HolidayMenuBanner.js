import React, { useEffect, useState } from 'react';
import { AppState, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Image from '../CachedImage';
const slides = [
  [require('../../../assets/campaigns/order-phindi.jpg'), 'PhinDi Highlands Coffee'],
  [require('../../../assets/campaigns/order-americano.jpg'), 'Americano Highlands Coffee'],
  [require('../../../assets/campaigns/order-noel.jpg'), 'Giáng sinh cùng Highlands Coffee'],
  [require('../../../assets/campaigns/order-highlands.png'), 'Cùng chia sẻ Highlands Coffee'],
];
export default function HolidayMenuBanner() {
  const [index,setIndex] = useState(0), [active,setActive] = useState(true);
  const focused = useIsFocused(), { width } = useWindowDimensions();
  useEffect(() => {
    const app = AppState.addEventListener('change',state => setActive(state === 'active'));
    return () => app.remove();
  },[]);
  useEffect(() => { if (!focused || !active) return; const timer = setInterval(() => setIndex(i => (i+1)%slides.length),10000); return () => clearInterval(timer); },[focused,active]);
  return <View style={[s.banner,{height:Math.min(width-32,568)*926/1920}]} testID="order-banner"><Image source={slides[index][0]} style={StyleSheet.absoluteFillObject} allowDownscaling={false} resizeMode="cover" contentPosition={index===3 ? 'top' : 'center'} accessibilityLabel={slides[index][1]} /></View>;
}
const s = StyleSheet.create({banner:{backgroundColor:'#a9252b',borderRadius:18,overflow:'hidden',marginBottom:16}});
