import React from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'

export function ActionButton({ label, onPress, variant = 'primary', icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.base, variant === 'secondary' && styles.secondary, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{icon ? `${icon} ` : ''}{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#f26b1d',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  secondary: {
    backgroundColor: '#eff6ff',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  text: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
})
