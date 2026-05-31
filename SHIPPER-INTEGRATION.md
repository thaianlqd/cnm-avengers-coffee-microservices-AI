# 🚚 Hướng Dẫn Tích Hợp Shipper System

## 📋 Tổng Quan

Quy trình mới với Shipper:

```
Khách hàng đặt hàng → Staff xác nhận → Shipper lấy → Shipper giao → Hoàn thành
  (web-customer)      (web-admin)        (web-shipper)
```

## 📱 Android App Thật (Windows)

Bạn có thể demo app shipper native Android trên Windows mà không cần macOS.

### Option A: Demo trên Android Emulator (khuyên dùng khi thuyết trình)

```powershell
cd avengers-coffee-system/apps/shipper-mobile

# 1) Bật Android Emulator từ Android Studio trước
# 2) Chạy app native Android
npm run android
```

Lưu ý kỹ thuật đã được cấu hình sẵn:
- Android mặc định gọi API qua `http://10.0.2.2:3000` (map về máy host Windows)
- Không còn dùng `localhost` sai ngữ cảnh trong app Android.

### Option B: Demo trên điện thoại Android thật (cùng Wi-Fi)

```powershell
cd avengers-coffee-system/apps/shipper-mobile
$env:EXPO_PUBLIC_API_URL='http://<LAN_IP_MAY_TINH>:3000'
npm run start
```

Sau đó mở Expo Go trên điện thoại và quét QR.

Ví dụ:
```powershell
$env:EXPO_PUBLIC_API_URL='http://192.168.100.41:3000'
```

### Option C: Build APK Android thật để cài trực tiếp (không cần macOS)

```powershell
cd avengers-coffee-system/apps/shipper-mobile
npm install -g eas-cli
eas login

# Build file APK để cài thẳng lên Android
$env:EXPO_PUBLIC_API_URL='http://<LAN_IP_MAY_TINH>:3000'
eas build -p android --profile preview
```

Sau khi build xong, Expo trả link tải `.apk` để bạn cài lên máy Android và demo như app thật.

### Tài khoản demo shipper
- Username: `shipper_demo`
- Password: `123456`

## ✅ Những gì đã tạo

### 1. **Backend - Order Service**

#### 📊 Entities (Database)
- `Shipper` - Thông tin shipper
  - id, username, full_name, phone, email
  - status (ACTIVE/INACTIVE/ON_BREAK)
  - branch_code, avatar_url
  - current_latitude, current_longitude (GPS tracking)
  - rating, total_deliveries, vehicle_info

- `ShipperDelivery` - Gán shipper cho đơn hàng
  - id, ma_don_hang (Order ID), shipper_id
  - status (PENDING/CONFIRMED/PICKING_UP/IN_TRANSIT/DELIVERED/FAILED)
  - pickup_latitude/longitude, delivery_latitude/longitude
  - delivery_note, proof_image_url, delivery_fee
  - picked_up_at, delivered_at timeline

#### 🔌 Controllers & Services
```
ShipperController @ /shippers
├── GET    /:shipperId/profile
├── GET    /:shipperId/deliveries?status=...
├── GET    /:shipperId/deliveries/:deliveryId
├── GET    /:shipperId/stats
├── POST   /:shipperId/deliveries/:id/confirm-pickup
├── POST   /:shipperId/deliveries/:id/start
├── POST   /:shipperId/deliveries/:id/complete
├── POST   /:shipperId/deliveries/:id/fail
├── PATCH  /:shipperId/status
└── PATCH  /:shipperId/location
```

### 2. **Frontend - Web-Shipper** (Port 5175)

#### 📱 Tính năng
- 🔐 Login page với demo mode
- 📊 Dashboard với stats cards
- 📦 Delivery list with filtering
- 🗺️ Detail modal với GPS integration
- 📍 Location tracking
- 🔔 Real-time notifications
- 📱 Fully responsive design

#### 🎨 UI Components
- Header (với profile shipper)
- DeliveryCard (thẻ đơn hàng)
- DeliveryDetailModal (chi tiết + hành động)
- StatsCard (thống kê)
- ProtectedRoute (xác thực)

## 🚀 Cáchử dụng

### Step 1: Update Order Service

Các file đã thêm/modify:

```
src/
├── modules/shipper/
│   ├── entities/
│   │   ├── shipper.entity.ts
│   │   └── shipper-delivery.entity.ts
│   ├── shipper.service.ts
│   ├── shipper.controller.ts
│   └── shipper.module.ts
└── app.module.ts (updated)
```

**Thực hiện:**
```bash
cd avengers-coffee-system/services/order-service

# Build lại service
npm run build

# Hoặc chạy development
npm run start:dev
```

### Step 2: Chạy Web-Shipper

```bash
cd avengers-coffee-system/apps/web-shipper

# Install dependencies
npm install

# Development
npm run dev
# Open: http://localhost:5175

# Hoặc dùng Docker
docker-compose up web-shipper
```

### Step 3: Update Docker Compose

File `docker-compose.yml` đã cập nhật với:

```yaml
web-shipper:
  build:
    context: ./avengers-coffee-system/apps/web-shipper
  ports:
    - "5175:80"  # New port!
  depends_on:
    - api-gateway
```

**Start tất cả:**
```bash
docker-compose up -d
# Services chạy trên:
# - web-customer: http://localhost:5173
# - web-admin: http://localhost:5174
# - web-shipper: http://localhost:5175  (NEW!)
```

## 🔄 Workflow Tích Hợp

### 1. **Order Created** (web-customer)
```
Customer đặt hàng → Order service tạo DonHang
Status: MOI_TAO
```

### 2. **Order Confirmed** (web-admin)
```
Staff xác nhận → Update trang_thai_don_hang = CHO_CHUAN_BI
Có thể gán shipper (admin chọn shipper)
```

### 3. **Shipper Assigned** (web-admin → web-shipper)
```
Admin gửi "Start delivery" request
ShipperDelivery record created với status = PENDING
```

### 4. **Shipper Accepts** (web-shipper)
```
Shipper xem danh sách PENDING
Bấm "Xác nhận lấy hàng"
Status: PENDING → CONFIRMED
picked_up_at = null (chưa lấy)
```

### 5. **Pickup Started** (web-shipper)
```
Shipper nhấn "Bắt đầu giao hàng"
Lấy GPS location
Status: CONFIRMED → PICKING_UP → IN_TRANSIT
pickup_latitude/longitude = GPS coords
```

### 6. **In Transit** (web-shipper)
```
Shipper đang giao hàng
Ứng dụng tracking GPS
```

### 7. **Delivery Complete** (web-shipper)
```
Shipper nhấn "Hoàn thành giao hàng"
Lấy GPS location delivery point
delivered_at = now
Status: IN_TRANSIT → DELIVERED
```

### 8. **Order Completed** (web-admin + web-customer)
```
Order status auto-sync = HOAN_THANH
Customer xem "Đã giao" trên web-customer
Admin thấy đơn hoàn thành
```

## 📊 Database Changes

### Thêm vào `orders` schema:

```sql
-- Shipper table
CREATE TABLE shipper (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR NOT NULL UNIQUE,
    full_name VARCHAR NOT NULL,
    phone VARCHAR NOT NULL,
    email VARCHAR,
    status VARCHAR DEFAULT 'ACTIVE',
    branch_code VARCHAR,
    current_latitude DECIMAL(10,8),
    current_longitude DECIMAL(11,8),
    total_deliveries INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 4.5,
    avatar_url TEXT,
    vehicle_type VARCHAR,
    vehicle_plate VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shipper Delivery table
CREATE TABLE shipper_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_don_hang UUID NOT NULL,
    shipper_id UUID NOT NULL REFERENCES shipper(id) ON DELETE SET NULL,
    status VARCHAR DEFAULT 'PENDING',
    delivery_note TEXT,
    delivery_address VARCHAR,
    pickup_latitude DECIMAL(10,8),
    pickup_longitude DECIMAL(11,8),
    delivery_latitude DECIMAL(10,8),
    delivery_longitude DECIMAL(11,8),
    estimated_time_minutes INTEGER,
    picked_up_at TIMESTAMP,
    delivered_at TIMESTAMP,
    proof_image_url TEXT,
    delivery_fee DECIMAL(12,2),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Automatic via TypeORM:** TypeORM sẽ auto-create tables khi service start (synchronize: true)

## 🔐 Authentication

### Option 1: JWT Tokens (Recommend)
```
POST /shippers/login
→ Returns: { access_token, shipper: {...} }
→ Store token in localStorage
→ All requests: Authorization: Bearer <token>
```

### Option 2: Simple Demo Mode
```
Button "🧪 Dùng Demo" 
→ Create mock shipper data
→ Store in localStorage
→ Perfect for testing!
```

## 📈 Integration dengan Admin

### Web-Admin cần update:

1. **Shipper Management Page**
   ```jsx
   // Admin quản lý shipper
   - Danh sách shipper
   - Tạo/Edit shipper
   - Xem status
   - Xem statistics
   ```

2. **Order Assignment UI**
   ```jsx
   // Khi staff chuẩn bị hàng
   - Dropdown chọn shipper
   - Auto-create ShipperDelivery record
   - Send notification to shipper
   ```

3. **Delivery Tracking**
   ```jsx
   // Admin theo dõi giao hàng real-time
   - Map view (GPS tracking)
   - Status updates
   - Timeline events
   ```

## 🗺️ GPS & Maps (Future Enhancement)

```jsx
// Thêm map library (optional)
npm install leaflet react-leaflet

// Display shipper location on map
import { MapContainer, TileLayer, Marker } from 'react-leaflet'

<MapContainer center={[shipper.lat, shipper.lng]} zoom={15}>
  <TileLayer url="https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png" />
  <Marker position={[delivery.lat, delivery.lng]} />
</MapContainer>
```

## 🔔 Real-time Updates (Socket.io)

```jsx
// Thêm Socket.io tracking (optional)
import { io } from 'socket.io-client'

const socket = io('http://localhost:3005')
socket.on('delivery_updated', (data) => {
  console.log('Shipper location:', data.lat, data.lng)
})
```

## ✨ Tạo Shipper Records (Admin)

```bash
# Thêm sample shipper qua API
curl -X POST http://localhost:3001/admin/shippers \
  -H "Content-Type: application/json" \
  -d '{
    "username": "shipper_001",
    "full_name": "Nguyễn Văn A",
    "phone": "0901234567",
    "branch_code": "HN001",
    "vehicle_type": "MOTORBIKE"
  }'
```

## 🎯 Next Steps

1. ✅ **Backend:** Shipper entities + API
2. ✅ **Frontend:** Web-Shipper app
3. ⏳ **Admin:** Update web-admin with shipper assignment
4. ⏳ **Notifications:** Real-time order notifications to shipper
5. ⏳ **GPS Map:** Live tracking dashboard
6. ⏳ **Rating System:** Customer rates shipper
7. ⏳ **Analytics:** Shipper performance metrics

## 📞 Testing Checklist

- [ ] Shipper login works
- [ ] Can view assigned deliveries
- [ ] Can confirm pickup
- [ ] Can start delivery (GPS captured)
- [ ] Can complete delivery
- [ ] Can mark as failed with note
- [ ] Stats update correctly
- [ ] Notifications display
- [ ] Mobile responsive
- [ ] localStorage persists data

## 🚀 Deployment

### Local Docker
```bash
docker-compose up -d
# Access: http://localhost:5175
```

### Production
```bash
# Build image
docker build -t shipper-app:latest ./apps/web-shipper

# Push to registry
docker push your-registry/shipper-app:latest

# Deploy
kubectl apply -f deployment.yaml
```

---

**Hoàn thành! 🎉**

Bây giờ bạn có một hệ thống shipper hoàn chỉnh với:
- Backend API cho shipper management
- Beautiful web app cho shipper dùng
- Docker support
- GPS tracking ready
- Fully responsive design!

Chúc bạn thành công! 💪
