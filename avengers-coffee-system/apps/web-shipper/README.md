# 🚚 Avengers Delivery - Web Shipper

Ứng dụng web hiện đại dành cho các shipper giao hàng của chuỗi cửa hàng Avengers Coffee.

## 🎯 Tính năng chính

### 📦 Quản lý giao hàng
- ✅ Xem danh sách đơn hàng cần giao
- ✅ Lọc theo trạng thái giao hàng
- ✅ Xem chi tiết từng đơn hàng
- ✅ Xác nhận lấy hàng
- ✅ Bắt đầu giao hàng (GPS tracking)
- ✅ Hoàn thành giao hàng
- ✅ Đánh dấu giao thất bại + ghi chú

### 📊 Thống kê & Phân tích
- 📈 Tổng số giao hàng
- 📊 Giao hàng hôm nay
- ⏳ Đơn đang chờ xử lý
- ❌ Đơn giao thất bại
- ⭐ Xếp hạng hiệu suất

### 🎨 Giao diện
- 💜 Thiết kế hiện đại với Tailwind CSS
- 📱 Responsive cho mobile, tablet, desktop
- 🌓 Smooth transitions & animations
- 🔔 Real-time notifications
- 📍 Xác định vị trí GPS

## 🛠️ Công nghệ

- **Frontend:** React 18 + Vite
- **State Management:** React Query (TanStack Query)
- **Styling:** Tailwind CSS + PostCSS
- **Icons:** Lucide React
- **Notifications:** React Hot Toast
- **Date Handling:** date-fns
- **HTTP Client:** Axios

## 📦 Installation

```bash
cd avengers-coffee-system/apps/web-shipper

# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build
```

## 🚀 Running

### Development Mode
```bash
npm run dev
# Open http://localhost:5175
```

### Docker
```bash
# Using docker-compose from project root
docker-compose up -d web-shipper

# Open http://localhost:5175
```

## 🔐 Đăng nhập

### Demo Credentials
```
- Username: shipper_demo
- Password: (bất kỳ mật khẩu)
- Hoặc bấm nút "🧪 Dùng Demo"
```

## 📡 API Integration

API baseURL: `http://localhost:3000`

### Endpoints được sử dụng:
```
GET    /shippers/:shipperId/profile        - Lấy thông tin shipper
GET    /shippers/:shipperId/deliveries     - Danh sách đơn hàng
GET    /shippers/:shipperId/stats          - Thống kê
POST   /shippers/:shipperId/deliveries/:id/confirm-pickup
POST   /shippers/:shipperId/deliveries/:id/start
POST   /shippers/:shipperId/deliveries/:id/complete
POST   /shippers/:shipperId/deliveries/:id/fail
```

## 📁 Cấu trúc Project

```
web-shipper/
├── src/
│   ├── components/
│   │   ├── Header.jsx              # Header với thông tin shipper
│   │   ├── DeliveryCard.jsx        # Thẻ đơn hàng
│   │   ├── DeliveryDetailModal.jsx # Modal chi tiết + hành động
│   │   ├── StatsCard.jsx           # Thẻ thống kê
│   │   └── ProtectedRoute.jsx      # Bảo vệ route
│   ├── context/
│   │   └── ShipperContext.jsx      # Context cho shipper data
│   ├── lib/
│   │   ├── apiClient.js            # Axios client
│   │   └── queryKeys.js            # React Query keys
│   ├── pages/
│   │   ├── Login.jsx               # Trang đăng nhập
│   │   └── Dashboard.jsx           # Dashboard chính
│   ├── App.jsx                     # App router
│   ├── main.jsx                    # Entry point
│   └── index.css                   # Global styles
├── public/                         # Static assets
├── Dockerfile                      # Docker image
├── nginx.conf                      # Nginx config
├── vite.config.js                  # Vite config
├── tailwind.config.js              # Tailwind config
├── postcss.config.js               # PostCSS config
└── package.json                    # Dependencies
```

## 🎨 Giao diện liên thông

### Trạng thái Đơn hàng
- 🟡 `PENDING` - Chờ xác nhận lấy hàng
- 🟢 `CONFIRMED` - Shipper xác nhận, chưa lấy
- 🟠 `PICKING_UP` - Đang lấy hàng tại cửa hàng
- 🟣 `IN_TRANSIT` - Đang giao hàng
- 🟢 `DELIVERED` - Đã giao thành công
- 🔴 `FAILED` - Giao thất bại (cần ghi chú lý do)

### Màu sắc & Biểu tượng
- **Màu chính:** Purple (#8B5CF6) + Pink (#EC4899)
- **Màu phụ:** Green, Orange, Blue, Red
- **Icons:** Lucide React (professional)

## 🔄 Workflow Giao hàng

```
1. Shipper xem danh sách PENDING
        ↓
2. Xác nhận lấy hàng (chuyển thành CONFIRMED)
        ↓
3. Bắt đầu giao (PICKING_UP → IN_TRANSIT + GPS)
        ↓
4. Hoàn thành / Thất bại
        ↓
5. Cập nhật thống kê
```

## 🌐 Environment Variables

```
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3005
```

## 📝 Notes

- Ứng dụng tự động refresh dữ liệu mỗi 10 giây
- Thống kê cập nhật mỗi 30 giây
- Hỗ trợ localStorage cho token & shipper data
- GPS tracking tích hợp với Geolocation API
- Báo lỗi real-time với React Hot Toast

## 🚀 Deployment

### Build for Production
```bash
npm run build
# Output: dist/
```

### Docker Image
```bash
docker build -t avengers-web-shipper:1.0.0 .
docker run -p 5175:80 avengers-web-shipper:1.0.0
```

## 📞 Support

Liên hệ: support@avengers-coffee.vn

---

**Phiên bản:** 1.0.0  
**Ngày cập nhật:** April 2026
