import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../theme'

export function BrandHeader({ title, subtitle, right }) {
  return (
    <LinearGradient colors={['#2f2119', '#f26b1d']} style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>A</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {right}
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    padding: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
})
