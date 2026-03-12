# Avengers Coffee System — Giới thiệu dự án

Hệ thống quản lý quán cà phê theo kiến trúc **microservices**, gồm ứng dụng đặt hàng cho khách hàng, trang quản trị cho admin, và các dịch vụ backend độc lập.

---

## Cấu trúc thư mục

```
├── avengers-coffee-system/
│   ├── api-gateway/          # Cổng API trung gian, điều hướng request từ FE đến các service
│   ├── apps/
│   │   ├── web-customer/     # Frontend khách hàng (React + Vite + Tailwind) — chạy tại localhost:5173
│   │   └── web-admin/        # Frontend quản trị (React + Vite) — dành cho nhân viên/admin
│   └── services/
│       ├── identity-service/ # Đăng ký, đăng nhập, quản lý user, điểm loyalty, hạng thành viên
│       ├── menu-service/     # Quản lý danh mục và sản phẩm (menu đồ uống)
│       ├── inventory-service/# Quản lý nguyên liệu, tồn kho
│       ├── order-service/    # Xử lý đặt hàng, thanh toán (VNPay, SePay), voucher
│       └── ai-service/       # (Python) Tính năng AI — gợi ý sản phẩm
│
├── docker-compose.yml        # Khởi chạy toàn bộ hệ thống bằng 1 lệnh
├── .env.example              # Mẫu biến môi trường — copy thành .env trước khi chạy
├── csdl_cnm.txt              # Script SQL khởi tạo database
└── scripts/
    ├── db-backup.ps1         # Script backup database ra file .sql
    ├── db-restore.ps1        # Script restore database từ file .sql
    └── backups/              # Thư mục chứa các file backup
```

---

## Hạ tầng (Docker)

| Container | Vai trò | Port |
|---|---|---|
| `avengers_db` | PostgreSQL — lưu trữ toàn bộ dữ liệu | 5433 |
| `avengers_redis` | Redis — cache, session | 6379 |
| `avengers_mq` | RabbitMQ — message queue giữa các service | 5672 / 15672 |
| `avengers_api_gateway` | API Gateway — cổng duy nhất cho FE gọi vào | 3000 |
| `avengers_identity_service` | Identity Service | nội bộ |
| `avengers_menu_service` | Menu Service | nội bộ |
| `avengers_inventory_service` | Inventory Service | nội bộ |
| `avengers_order_service` | Order Service | 3005 |
| `avengers_web_customer` | Web khách hàng | 5173 |

---

## Khởi chạy nhanh

```powershell
# 1. Copy file môi trường
copy .env.example .env

# 2. Khởi động toàn bộ hệ thống
docker compose up -d

# 3. Mở trình duyệt
# Khách hàng:  http://localhost:5173
# API Gateway: http://localhost:3000
# RabbitMQ UI: http://localhost:15672
```

---

## Backup & Restore Database

Data được lưu trong Docker volume `avengers_pgdata` — **`docker compose down` không mất data**, chỉ `docker compose down -v` mới xóa.

```powershell
# Backup (chạy từ thư mục gốc)
.\scripts\db-backup.ps1

# Restore
.\scripts\db-restore.ps1 -InputFile .\scripts\backups\avengers_coffee_YYYYMMDD_HHMMSS.sql
```
