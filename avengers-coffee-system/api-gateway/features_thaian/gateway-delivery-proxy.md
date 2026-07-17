# Hướng Dẫn Cấu Hình Gateway Proxy Cho Delivery (Lalamove & Tracking)

Các endpoint mới của hệ thống giao hàng và tracking được thiết kế để nằm dưới prefix `/shippers/delivery`.
Do API Gateway hiện tại đã cấu hình chuyển tiếp `/shippers` sang `order-service`, bạn **KHÔNG CẦN** sửa đổi mã nguồn gốc của API Gateway.

## Cấu trúc endpoints mới trên order-service

1. **Lalamove API:** `/shippers/delivery/lalamove/*`
2. **Customer Tracking API:** `/shippers/delivery/tracking/*`

## Xác minh Gateway Configuration (Chỉ để kiểm tra)

Hãy chắc chắn rằng trong file `api-gateway/gateway-root/src/main.ts` của bạn đã có cấu hình proxy cho `/shippers` trỏ tới `order-service` (cổng 3005) tương tự như sau:

```typescript
// Ví dụ cấu hình hiện tại trong gateway-root/src/main.ts
app.use(
  '/shippers',
  createProxyMiddleware({
    target: process.env.ORDER_SERVICE_URL || 'http://localhost:3005',
    changeOrigin: true,
    pathRewrite: {
      // Giữ nguyên path, không rewrite để order-service nhận đúng /shippers/...
      // Hoặc tùy theo cấu hình hiện tại của bạn
    },
  }),
);
```

Vì các controller mới tôi tạo sử dụng prefix `@Controller('shippers/delivery/...')`, gateway sẽ tự động bắt tất cả các request này (vì chúng bắt đầu bằng `/shippers`) và forward sang `order-service` thành công.

## Test trên Local

1. Đảm bảo `order-service` đang chạy (mặc định port 3005).
2. Đảm bảo `gateway-root` đang chạy (mặc định port 3000).
3. Test thử tracking API bằng Postman:
   - GET `http://localhost:3000/shippers/delivery/tracking/by-code/lookup?code=ABC`
   - Gateway (port 3000) sẽ proxy request tới `http://localhost:3005/shippers/delivery/tracking/by-code/lookup?code=ABC`
