import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, shadows } from '../theme'

export function StatCard({ label, value, icon, tone = 'primary', subtitle }) {
  return (
    <LinearGradient
      colors={tone === 'primary' ? ['#fff4e8', '#ffffff'] : ['#eff6ff', '#ffffff']}
      style={[styles.card, shadows.card]}
    >
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.iconBubble}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flex: 1,
    minHeight: 112,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: colors.coffee,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
})
