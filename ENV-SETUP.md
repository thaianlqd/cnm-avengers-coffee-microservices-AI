# Environment Variables Setup Guide
# Avengers Coffee - Web Customer + Identity Service

## 1. Frontend Environment Variables (.env.local hoặc .env.development)

Tạo file `.env.local` trong thư mục `avengers-coffee-system/apps/web-customer/`:

```
# API Gateway URL
VITE_API_URL=http://localhost:3000

# Google OAuth Configuration
# Lấy từ Google Cloud Console (https://console.cloud.google.com/)
# Tạo OAuth 2.0 Client ID cho Web Application
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com

# reCAPTCHA v3 Site Key
# Lấy từ Google reCAPTCHA Admin Console (https://www.google.com/recaptcha/admin)
VITE_RECAPTCHA_SITE_KEY=YOUR_RECAPTCHA_SITE_KEY_HERE
```

## 2. Backend Environment Variables (docker-compose.yml hoặc .env.production)

Cộng vào `docker-compose.yml` trong environment của `identity-service`:

```yaml
identity-service:
  # ... existing config ...
  environment:
    # ... existing vars ...
    
    # reCAPTCHA v3 Secret Key
    RECAPTCHA_SECRET_KEY=YOUR_RECAPTCHA_SECRET_KEY_HERE
```

## 3. Cách lấy Google OAuth 2.0 Client ID

### Bước 1: Truy cập Google Cloud Console
- Đi tới https://console.cloud.google.com/
- Chọn hoặc tạo một project mới

### Bước 2: Kích hoạt Google Identity Services API
- Trong Search box, tìm "Google Identity Services API"
- Kích hoạt API

### Bước 3: Tạo OAuth 2.0 Credentials
- Đi tới "Credentials" trong sidebar
- Chọn "Create Credentials" → "OAuth 2.0 Client IDs"
- Chọn Application type: **Web Application**
- Thêm Authorized redirect URIs:
  - `http://localhost:5173` (dev frontend)
  - `http://localhost:3000` (production)
  - `https://yourdomain.com` (production domain)
- Ấn "Create"
- Copy **Client ID** vào VITE_GOOGLE_CLIENT_ID

## 4. Cách lấy reCAPTCHA v3 Keys

### Bước 1: Truy cập reCAPTCHA Admin Console
- Đi tới https://www.google.com/recaptcha/admin
- Đăng nhập bằng Google Account

### Bước 2: Tạo reCAPTCHA v3
- Ấn "Create" hoặc "+" 
- **Label**: Avengers Coffee Customer App
- **reCAPTCHA type**: reCAPTCHA v3
- **Domains**:
  - `localhost` (dev)
  - `yourdomain.com` (production)
- Chấp nhận Terms và Create

### Bước 3: Copy Keys
- Copy **Site Key** vào VITE_RECAPTCHA_SITE_KEY
- Copy **Secret Key** vào RECAPTCHA_SECRET_KEY (backend)

## 5. Test Flow

### Test Google Sign-In:
1. Mở http://localhost:5173/ (web-customer)
2. Bấm nút "Đăng nhập" → "Google sign-in button"
3. Đăng nhập bằng tài khoản Google (hoàn hảo là ankudo1234@gmail.com)
4. reCAPTCHA v3 sẽ tự động xác minh ở background
5. Backend sẽ:
   - Verify Google token
   - Tìm hoặc tạo user mới
   - Trả về access token

### Test reCAPTCHA:
- Score sẽ hiển thị % khả năng là con người (0-100%)
- Nếu < 50%, sẽ bị từ chối
- Có thể test bằng Chrome DevTools → Extension Simulator

## 6. Troubleshooting

### "Google token khong hop le"
- Kiểm tra VITE_GOOGLE_CLIENT_ID có chính xác không
- Kiểm tra domain có trong Google Cloud Console không

### "Xac minh reCAPTCHA that bai"
- Kiểm tra VITE_RECAPTCHA_SITE_KEY (frontend)
- Kiểm tra RECAPTCHA_SECRET_KEY (backend)
- Kiểm tra domain đã thêm vào reCAPTCHA admin

### reCAPTCHA bị block
- Đặt `RECAPTCHA_SECRET_KEY=""` (rỗng) để skip verify trong dev
- Kiểm tra network tab → Thử lại

### User đăng nhập thành công nhưng dữ liệu không đúng
- Kiểm tra JWT signature
- Kiểm tra identity-service v có log Google user info không
- Verify token payload ở base64 decode

## 7. Production Deployment

1. Cập nhật VITE_API_URL thành production backend URL
2. Thêm production domain vào Google OAuth + reCAPTCHA
3. Sử dụng secured environment variables (không hardcode)
4. Kiểm tra HTTPS được kích hoạt (Google OAuth & reCAPTCHA yêu cầu HTTPS)

---

Tôi đã triển khai đầy đủ cho bạn:
✅ Google OAuth 2.0 Sign-in
✅ reCAPTCHA v3 xác minh bot
✅ Dynamic user data từ Go
