import React, { useEffect, useRef, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Camera, useCameraPermissions } from 'expo-camera'
import { colors } from '../theme'

export function QRScannerModal({ visible, onClose, onQRScanned }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [scannedData, setScannedData] = useState(null)
  const cameraRef = useRef(null)

  // Request camera permission when component mounts
  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission()
    }
  }, [visible, permission?.granted, requestPermission])

  // Activate camera when modal opens
  useEffect(() => {
    if (visible) {
      setIsCameraActive(true)
    } else {
      setIsCameraActive(false)
      setScannedData(null)
    }
  }, [visible])

  const handleBarCodeScanned = (result) => {
    // Prevent duplicate scans
    if (scannedData) return

    // Handle different expo-camera formats
    let qrData = null
    if (result?.barcodes?.length > 0) {
      // New format: { barcodes: [{ data, type, ... }] }
      qrData = result.barcodes[0].data
    } else if (result?.data) {
      // Old format: { type, data }
      qrData = result.data
    }

    if (!qrData) return

    setScannedData(qrData)
    setIsCameraActive(false)

    // Wait a moment for user to see feedback, then process
    Alert.alert(
      'QR Code phát hiện',
      `Dữ liệu: ${qrData}\n\nXác nhận dữ liệu này?`,
      [
        {
          text: 'Hủy - Quét lại',
          onPress: () => {
            setScannedData(null)
            setIsCameraActive(true)
          },
        },
        {
          text: 'Xác nhận',
          onPress: () => {
            onQRScanned?.(qrData)
            onClose?.()
          },
        },
      ],
    )
  }

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.loadingText}>Đang xin quyền camera...</Text>
          </View>
        </View>
      </Modal>
    )
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.errorTitle}>❌ Cần quyền camera</Text>
            <Text style={styles.errorText}>
              Ứng dụng cần quyền truy cập camera để quét mã QR. Vui lòng cho phép trong Settings.
            </Text>
            <Pressable
              onPress={() => requestPermission()}
              style={({ pressed }) => [styles.permissionBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.permissionBtnText}>Yêu cầu quyền</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.cancelText}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {isCameraActive ? (
          <Camera
            ref={cameraRef}
            style={styles.camera}
            onBarcodeScanned={handleBarCodeScanned}
          >
            <View style={styles.overlay}>
              {/* Top bar */}
              <View style={styles.topBar}>
                <Text style={styles.header}>Quét mã QR</Text>
              </View>

              {/* Scanning frame */}
              <View style={styles.scannerFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>

              {/* Info text */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Di chuyển điện thoại để quét mã QR trên package
                </Text>
              </View>

              {/* Bottom buttons */}
              <View style={styles.bottomBar}>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.closeBtnText}>✕ Đóng</Text>
                </Pressable>
              </View>
            </View>
          </Camera>
        ) : (
          <View style={styles.content}>
            <Text style={styles.loadingText}>Đang khởi động camera...</Text>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 40,
  },
  topBar: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  header: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  scannerFrame: {
    alignSelf: 'center',
    width: 250,
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  infoBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    alignItems: 'center',
  },
  closeBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.danger,
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
})
