# 🔧 QR Code Scanner - Shipper Mobile App

## ✅ Những gì vừa được fix

### Thêm QR Code Scanner vào Shipper Mobile App

1. **📦 Thêm library**: `expo-camera` v14.1.0
2. **🎥 QRScannerModal Component**: Quét QR code với camera
3. **🚚 Integrated vào DeliveryDetailModal**: 
   - Khi shipper ở trạng thái `IN_TRANSIT` → Nút "📱 Quét QR xác nhận"
   - Quét QR trên package để xác nhận giao hàng
   - QR data được gửi kèm request `/complete` tới backend

---

## 🚀 Cách Setup

### 1️⃣ Install Dependencies

```bash
cd avengers-coffee-system/apps/shipper-mobile

# Cài đặt expo-camera
npm install

# Hoặc nếu npm install không tự động cài:
npx expo install expo-camera
```

### 2️⃣ Setup Permissions (iOS)

Thêm vào `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "ứng dụng cần quyền camera để quét mã QR giao hàng"
        }
      ]
    ]
  }
}
```

### 3️⃣ Run trên Expo Go

#### **iOS (iPhone)**:
```bash
npm start
# Press 'i' để chạy trên Simulator
# Hoặc scan QR code bằng Camera app để mở Expo Go
```

#### **Android**:
```bash
npm start
# Press 'a' để chạy trên Emulator
# Hoặc scan QR code bằng Expo Go app
```

---

## 🎮 Cách sử dụng

### Quy trình Giao Hàng với QR Scan:

```
1. Shipper mở đơn (trạng thái = IN_TRANSIT)
   ↓
2. Shipper bấm nút "📱 Quét QR xác nhận"
   ↓
3. Modal camera hiện lên
   ↓
4. Shipper đặt điện thoại camera hướng vào QR code trên package
   ↓
5. Camera tự động phát hiện + quét QR code
   ↓
6. Alert hiện: "QR Code phát hiện - Dữ liệu: [...]"
   ↓
7. Shipper bấm "Xác nhận" → Hoàn thành giao hàng (backend nhận QR data)
   ↓
8. Trạng thái đơn → DELIVERED ✅
```

---

## 🐛 Nếu gặp lỗi

### ❌ "Không tải được dữ liệu" / Camera not working

**Nguyên nhân**: Quyền camera chưa được cấp

**Fix**:
- **iOS**: Go to Settings → Avengers/Expo Go → Camera → Allow
- **Android**: Go to Settings → Apps → Avengers/Expo Go → Permissions → Camera → Allow

### ❌ "Quét mãi không được"

**Nguyên nhân**: QR code không đủ sáng hoặc quá mờ

**Fix**:
- Di chuyển điện thoại gần hơn
- Bảo đảm QR code có ánh sáng đủ
- Giữ điện thoại ở góc 45°

### ❌ "expo-camera module not found"

**Fix**:
```bash
cd avengers-coffee-system/apps/shipper-mobile
rm -rf node_modules package-lock.json
npm install
npx expo install expo-camera
```

---

## 📱 Test QR Code

Bạn có thể tạo test QR code tại: https://www.qr-code-generator.com/

**Ví dụ QR data**: `ORDER_123456` hoặc `DELIVERY_ABC789`

---

## 🔧 Backend Integration

Backend (`order-service`) sẽ nhận:

```json
{
  "action": "complete",
  "latitude": 10.7758,
  "longitude": 106.701,
  "qr_data": "ORDER_123456"  // ← Dữ liệu từ QR code
}
```

Backend có thể:
- Validate QR data với order ID
- Ghi log QR scan evidence
- Update delivery status → DELIVERED
- Kiểm tra xác thực giao hàng

---

## 📝 Code Structure

```
shipper-mobile/
├── src/
│   ├── components/
│   │   ├── QRScannerModal.js      ← NEW: Quét QR (camera UI)
│   │   ├── DeliveryDetailModal.js ← UPDATED: Integrate QR scanner
│   │   └── ...
│   ├── screens/
│   ├── navigation/
│   └── ...
├── package.json                    ← UPDATED: +expo-camera
└── app.json
```

---

## ✨ Features

✅ Real-time QR code scanning  
✅ Works on iOS + Android  
✅ Works in Expo Go (no build needed)  
✅ Auto-focus camera  
✅ Permission handling  
✅ QR data validation UI  
✅ Confirm before submit  
✅ Error handling + alerts  

---

## 🎯 Next Steps (Optional)

- [ ] Validate QR data format on frontend
- [ ] Save scanning history in local storage
- [ ] Add barcode support (not just QR)
- [ ] Add sound feedback on successful scan
- [ ] Add haptic feedback (vibration)
- [ ] Add offline QR storage fallback

---

**Happy Scanning! 📱✨**
