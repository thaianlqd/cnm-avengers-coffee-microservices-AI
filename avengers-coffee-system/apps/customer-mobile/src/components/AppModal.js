import React from 'react'
import { Modal, View, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
export default function AppModal({ children, presentationStyle, transparent, ...props }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const sheet = transparent || presentationStyle === 'pageSheet'
  return <Modal {...props} transparent presentationStyle="overFullScreen" statusBarTranslucent>
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.42)', alignItems: 'center', justifyContent: 'flex-end' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: Math.min(width, 480), height: height - insets.top, maxHeight: height - insets.top,
          paddingBottom: insets.bottom, backgroundColor: sheet ? 'transparent' : '#fff', overflow: 'hidden' }}>
        {children}
      </KeyboardAvoidingView>
    </View>
  </Modal>
}
