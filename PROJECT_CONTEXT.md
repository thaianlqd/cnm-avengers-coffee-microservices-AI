# 🦸‍♂️ AVENGERS COFFEE SYSTEM - COMPREHENSIVE PROJECT CONTEXT
> **Single Source of Truth (SSOT)** for Developers & AI Agents.  
> *Tài liệu đặc tả toàn diện 100% kiến trúc, thư mục, dịch vụ, cơ sở dữ liệu, luồng nghiệp vụ và quy chuẩn hệ thống Avengers Coffee.*

---

## 📌 1. TỔNG QUAN HỆ THỐNG (SYSTEM OVERVIEW)

**Avengers Coffee** là một nền tảng F&B (chuỗi cà phê thông minh) quy mô lớn, kết hợp thương mại điện tử, quản lý nhượng quyền thương hiệu (Franchise Kiosk), điều phối giao hàng (Shipper Platform), trí tuệ nhân tạo (AI Recommendation, Demand Forecasting, Hybrid Chatbot) và Nền tảng Dữ liệu Hiện đại 7 Lớp (Modern Data Stack).

### 🛠️ Tech Stack Toàn Diện
| Tầng / Thành phần | Công nghệ / Framework chính |
|---|---|
| **API Gateway** | NestJS 10, `http-proxy-middleware`, Axios, CORS |
| **Backend Microservices** | NestJS (TypeScript), TypeORM, Class-Validator, Node.js 20+ |
| **AI / ML Service** | Python 3.11, FastAPI, Scikit-learn, Pandas, Prophet, NumPy, Gemini API, Groq API |
| **Data Platform** | Apache Kafka, Apache Spark (PySpark), Apache Airflow, MinIO (S3 Lakehouse), Trino, Streamlit |
| **Database** | PostgreSQL 16 (Multi-Schema: `identity`, `menu`, `inventory`, `orders`, `news`, `ai`) |
| **Cache & Realtime** | Redis 7 (Alpine), RabbitMQ 3 (Management), Socket.io (WebSocket) |
| **Payment Gateways** | VNPay (Sandbox / HMAC-SHA512), SePay (Bank Transfer Webhook), COD, Ví thành viên, Gift Card |
| **Frontend Web** | React 19 / 18, Vite, Tailwind CSS, Lucide React, Heroicons, Recharts, Axios, React Query |
| **Mobile Apps** | React Native, Expo SDK, React Navigation, AsyncStorage |
| **Container & Ops** | Docker, Docker Compose, Nginx, PowerShell Scripts |

---

## 🗂️ 2. CẤU TRÚC THƯ MỤC CHI TIẾT (PROJECT DIRECTORY TREE)

```
c:\Users\admin\hk1-2026\cnm-avengers-coffee-microservices-AI\
│
├── .env                                # File cấu hình môi trường thực tế (chứa credentials, API keys)
├── .env.example                        # File mẫu mô tả tất cả biến môi trường cần thiết
├── .gitignore                          # Cấu hình bỏ qua file cho Git
├── .github/                            # GitHub Actions & CI/CD workflows
├── ARCHITECTURE.md                     # Tài liệu kiến trúc hệ thống gốc (Microservices & 7-layer data platform)
├── ENV-SETUP.md                        # Hướng dẫn chi tiết thiết lập biến môi trường
├── HUONG_PHAT_TRIEN_DATA_PLATFORM.md   # Định hướng mở rộng Data Platform doanh nghiệp
├── IMPLEMENTATION-SUMMARY.md           # Báo cáo tóm tắt tiến độ triển khai
├── PROJECT_CONTEXT.md                  # 👉 FILE NÀY: Ngữ cảnh 100% toàn diện cho AI Agent
├── QR-CODE-SCANNER-SETUP.md            # Hướng dẫn tích hợp máy quét mã QR / camera
├── README-COMPLETION.md                # Ghi chú nghiệm thu các tính năng đã hoàn thiện
├── SECURITY.md                         # Hướng dẫn bảo mật, mã hóa token, JWT, phân quyền
├── SETUP.md                            # Cẩm nang cài đặt và chạy ứng dụng từng bước
├── SHIPPER-INTEGRATION.md              # Đặc tả tích hợp hệ thống điều phối Shipper
├── docker-compose.yml                  # Khởi chạy toàn bộ hệ thống Microservices & Frontend
├── docker-compose.data.yml             # Khởi chạy tầng Modern Data Platform (Kafka, Spark, Airflow, MinIO, Streamlit)
│
├── avengers-coffee-system/             # ── THƯ MỤC CHÍNH CỦA ỨNG DỤNG ──────────────────────────────
│   ├── api-gateway/                    # API Gateway định tuyến tập trung
│   │   ├── gateway-root/               # Source code NestJS Gateway (Port 3000)
│   │   │   ├── src/
│   │   │   │   ├── app.module.ts       # Module gốc của Gateway
│   │   │   │   └── main.ts             # Cấu hình Proxy Middleware tới từng Microservice
│   │   │   └── package.json, Dockerfile
│   │   └── features_thaian/            # Ghi chú định tuyến mở rộng cho shipper & delivery
│   │
│   ├── services/                       # ── CÁC BACKEND MICROSERVICES ───────────────────────────────
│   │   ├── identity-service/           # Service xác thực, người dùng, nhượng quyền (Port 3001)
│   │   │   ├── src/
│   │   │   │   ├── auth/               # Guards: JwtAuthGuard, RolesGuard, AuthDecorators
│   │   │   │   └── modules/
│   │   │   │       ├── user/           # Quản lý User, Chi nhánh (Branch), Địa chỉ, Khuyến mãi, Membership
│   │   │   │       │   ├── user.entity.ts, branch.entity.ts, delivery-address.entity.ts
│   │   │   │       │   ├── promotion.entity.ts, promotion-usage.entity.ts, membership-config.entity.ts
│   │   │   │       │   ├── user.service.ts (xử lý auth, login, register, OAuth, profile)
│   │   │   │       │   └── user.controller.ts (/auth, /users, /promotions)
│   │   │   │       └── franchise/      # Quản lý nhượng quyền thương hiệu (Franchise Kiosk)
│   │   │   │           ├── entities/   # Hồ sơ, Hợp đồng, Kiosk, Combo nguyên liệu, Công nợ, Đối soát, Vi phạm...
│   │   │   │           ├── franchise.service.ts (logic hợp đồng, tính chiết khấu, kiểm tra vi phạm)
│   │   │   │           └── franchise.controller.ts (/franchise)
│   │   │   └── Dockerfile, package.json, tsconfig.json
│   │   │
│   │   ├── menu-service/               # Service danh mục & món ăn đồ uống (Port 3003)
│   │   │   ├── src/
│   │   │   │   ├── modules/menu/       # Quản lý danh mục (danh-muc), sản phẩm (san-pham), biến thể & topping
│   │   │   │   │   ├── danh-muc.entity.ts, san-pham.entity.ts, bien-the-san-pham.entity.ts, thuoc-tinh.entity.ts
│   │   │   │   │   ├── menu.service.ts, menu.controller.ts (/menu)
│   │   │   │   └── app.module.ts, main.ts
│   │   │   └── Dockerfile, package.json
│   │   │
│   │   ├── inventory-service/          # Service kho hàng & nguyên vật liệu theo chi nhánh (Port 3004)
│   │   │   ├── src/
│   │   │   │   ├── modules/inventory/  # Quản lý tồn kho theo Branch, cảnh báo hết hàng
│   │   │   │   │   ├── inventory-item.entity.ts
│   │   │   │   │   ├── inventory.service.ts, inventory.controller.ts (/inventory)
│   │   │   │   └── app.module.ts, main.ts
│   │   │   └── Dockerfile, package.json
│   │   │
│   │   ├── order-service/              # ⭐ Service cốt lõi & phức tạp nhất (Port 3005)
│   │   │   ├── src/
│   │   │   │   ├── entities/           # Review, BranchReview, SurveyForm, SurveyResponse
│   │   │   │   ├── controllers/        # ReviewController, BranchReviewController, SurveyController
│   │   │   │   ├── services/           # ReviewService, BranchReviewService, SurveyService
│   │   │   │   ├── infrastructure/     # Kết nối Cache (Redis), Messaging (RabbitMQ), Analytics
│   │   │   │   └── modules/            # 9 Submodules nghiệp vụ chuyên sâu:
│   │   │   │       ├── cart/           # Giỏ hàng realtime (đồng bộ Redis + DB)
│   │   │   │       ├── thanh-toan/     # Cổng thanh toán VNPay (HMAC-SHA512), SePay Webhook, COD
│   │   │   │       ├── shipper/        # Điều phối giao hàng, nhận đơn, tọa độ GPS, hoa hồng
│   │   │   │       ├── chat/           # Hỗ trợ trực tuyến Customer <-> Support qua WebSocket
│   │   │   │       ├── notification/   # Hệ thống thông báo đẩy (RabbitMQ + Socket.io rooms)
│   │   │   │       ├── customer-wallet/# Quản lý ví điện tử khách hàng, nạp/rút/thanh toán nội bộ
│   │   │   │       ├── gift-card/      # Phát hành & đổi thẻ quà tặng điện tử
│   │   │   │       ├── voucher/        # Quản lý voucher cá nhân, mã trúng từ Lucky Wheel
│   │   │   │       └── favorite/       # Sản phẩm yêu thích của khách hàng
│   │   │   └── Dockerfile, package.json
│   │   │
│   │   ├── news-service/               # Service tin tức, bài viết, sự kiện & upload media (Port 3006)
│   │   │   ├── src/
│   │   │   │   └── modules/news/       # Quản lý bài viết blog, upload file hình ảnh
│   │   │   │       ├── entities/       # News entity
│   │   │   │       ├── news.service.ts, news.controller.ts (/news, /uploads/news)
│   │   │   └── Dockerfile, package.json
│   │   │
│   │   └── ai-service/                 # ⭐ Service Trí tuệ nhân tạo Python / FastAPI (Port 8000)
│   │       ├── main.py                 # FastAPI server, endpoints `/ai/recommend`, `/ai/forecast`, `/ai/chat`, `/ai/behavior`
│   │       ├── cf_service.py           # Thuật toán Collaborative Filtering (Cosine Similarity trên ma trận User-Item)
│   │       ├── forecast_service.py     # Dự báo nhu cầu bán hàng (Prophet + Holt-Winters Triple Smoothing)
│   │       ├── groq_service.py         # Tích hợp LLM Groq / Llama-3 siêu tốc
│   │       ├── ai_persistence.py       # Lưu trữ model metadata vào bảng `ai.mo_hinh_ai` & nhật ký `ai.nhat_ky_suy_luan`
│   │       ├── db.py                   # Kết nối cơ sở dữ liệu AsyncPG / PostgreSQL
│   │       └── requirements.txt, Dockerfile
│   │
│   ├── apps/                           # ── CÁC ỨNG DỤNG FRONTEND & MOBILE ──────────────────────────
│   │   ├── web-customer/               # Web đặt hàng cho khách (React 19 + Vite, Port 5175/5173)
│   │   │   ├── src/
│   │   │   │   ├── App.jsx             # Router chính, quản lý Header/Footer, Modal, Context Providers
│   │   │   │   ├── i18n.js             # Đa ngôn ngữ (Tiếng Việt / English)
│   │   │   │   ├── pages/              # Các trang giao diện: Home, Order, Cart, ProductDetail, Stores,
│   │   │   │   │                       # FranchisePage, LuckyWheel, Membership, GiftCard, News, Survey,
│   │   │   │   │                       # Profile, Support, ChinhSachDatHang, OrderTrackingPage...
│   │   │   │   ├── components/         # Navbar, Footer, AI Chatbot Popup, ProductCard, VoucherSelector...
│   │   │   │   └── context/            # AuthContext, CartContext, SocketContext
│   │   │   └── vite.config.js, tailwind.config.js, package.json
│   │   │
│   │   ├── web-admin/                  # Web quản trị đa vai trò (React 19 + Vite, Port 5174)
│   │   │   ├── src/
│   │   │   │   ├── App.jsx             # Điều hướng theo vai trò (ADMIN, MANAGER, STAFF)
│   │   │   │   └── features/           # Phân hệ quản lý:
│   │   │   │       ├── actor-admin/    # Quản trị viên tối cao: Hệ thống, phân quyền, cấu hình toàn cục
│   │   │   │       ├── admin-dashboard/# Báo cáo thống kê doanh thu, biểu đồ phân tích
│   │   │   │       ├── manager-dashboard/# Quản lý đơn hàng, xuất nhập kho chi nhánh, duyệt ca làm
│   │   │   │       ├── staff-dashboard/# POS bán hàng tại quầy, pha chế, in hóa đơn
│   │   │   │       ├── franchise/      # Quản lý hợp đồng nhượng quyền, Kiosk, công nợ, đơn mua combo
│   │   │   │       └── workforce/      # Quản lý ca trực nhân viên, phân công, bảng chấm công
│   │   │   └── vite.config.js, package.json
│   │   │
│   │   ├── web-shipper/                # Web portal tài xế giao hàng (React 18 + Vite, Port 5175)
│   │   │   ├── src/pages/              # Nhận đơn, Bản đồ giao hàng, Lịch sử thu nhập, Đánh giá
│   │   │   └── server.js, vite.config.js, package.json
│   │   │
│   │   ├── shipper-launcher/           # Cổng khởi động nhanh cho shipper (Port 5176)
│   │   │
│   │   ├── customer-mobile/            # Ứng dụng di động khách hàng (React Native / Expo)
│   │   │   └── src/ (screens: Home, Menu, Cart, Orders, Points, Profile, LuckyWheel)
│   │   ├── shipper-mobile/             # Ứng dụng di động tài xế (React Native / Expo)
│   │   │   └── src/ (screens: AvailableOrders, CurrentDelivery, MapView, Wallet, Profile)
│   │   └── admin-mobile/               # Ứng dụng di động chủ quán / quản lý (React Native / Expo)
│   │       └── src/ (screens: Dashboard, LiveOrders, InventoryAlert, RevenueReport)
│   │
│   └── shared/                         # Thư mục chia sẻ chung (Uploads hình ảnh, media)
│       └── uploads/                    # Chứa ảnh sản phẩm, ảnh tin tức, avatar
│
├── data-platform/                      # ── MODERN DATA PLATFORM (7 LỚP DỮ LIỆU) ───────────────────
│   ├── kafka-producer/                 # Producer đọc sự kiện từ PostgreSQL đẩy vào Kafka topics
│   │   └── producer.py                 # Trích xuất đơn hàng, hành vi, thay đổi kho theo chu kỳ
│   ├── spark-jobs/                     # Các Spark ETL Jobs xử lý dữ liệu Lakehouse
│   │   ├── bronze_ingestion.py         # Lưu Raw Data dạng Parquet vào MinIO bucket `avengers-bronze`
│   │   ├── silver_transform.py         # Làm sạch, deduplicate, validate schema vào `avengers-silver`
│   │   └── gold_aggregation.py         # Tính toán KPIs, RFM segmentation, CLV vào `avengers-gold`
│   ├── airflow/                        # Trình điều phối luồng dữ liệu tự động (Port 8083)
│   │   └── dags/daily_pipeline_dag.py  # DAG chạy định kỳ Bronze -> Silver -> Gold -> Retrain AI
│   ├── streamlit-app/                  # Bảng điều khiển phân tích BI & AI nâng cao (Port 8501)
│   │   ├── app.py                      # UI Streamlit biểu đồ doanh thu, dự báo, hành vi, bản đồ chi nhánh
│   │   └── ai_engine.py                # Phân tích insight AI với LLM (Claude / Groq)
│   └── seed_data.py                    # Script tạo dữ liệu giả lập cho Data Platform
│
├── dashboard/                          # Mockup thiết kế & screenshot giao diện mẫu
├── DesignAdmin/                        # File HTML/CSS mẫu cho hệ thống quản trị
└── scripts/                            # ── TẬP LỆNH QUẢN TRỊ HỆ THỐNG ──────────────────────────────
    ├── db-backup.ps1                   # Backup toàn bộ database PostgreSQL thành file nén
    ├── db-restore.ps1                  # Restore database từ bản backup
    ├── seed-behavior-data.ps1          # Tạo dữ liệu hành vi (đơn hàng, đánh giá, yêu thích) để train AI
    ├── README-db.md                    # Hướng dẫn backup / restore chi tiết
    └── backups/                        # Thư mục chứa các file backup `.sql.gz`
```

---

## 🏛️ 3. KIẾN TRÚC VI DỊCH VỤ (MICROSERVICES DEEP-DIVE)

```
                            ┌───────────────────────────────────────────────┐
                            │           CLIENTS / USER INTERFACES           │
                            │  Web Customer | Web Admin | Web Shipper       │
                            │  Customer App | Shipper App | Admin App       │
                            └───────────────────────┬───────────────────────┘
                                                    │ (HTTP / WebSocket)
                                                    ▼
                            ┌───────────────────────────────────────────────┐
                            │            API GATEWAY (Port 3000)            │
                            │             NestJS Reverse Proxy              │
                            └───────┬──────────────┬──────────────┬─────────┘
                                    │              │              │
           ┌────────────────────────┼──────────────┼──────────────┼────────────────────────┐
           ▼                        ▼              ▼              ▼                        ▼
┌────────────────────┐   ┌────────────────────┐ ┌────────────────────┐   ┌────────────────────┐ ┌────────────────────┐
│  Identity Service  │   │    Menu Service    │ │ Inventory Service  │   │   Order Service    │ │     AI Service     │
│    (Port 3001)     │   │    (Port 3003)     │ │    (Port 3004)     │   │    (Port 3005)     │ │    (Port 8000)     │
│   Schema: identity │   │    Schema: menu    │ │ Schema: inventory  │   │   Schema: orders   │ │     Schema: ai     │
└─────────┬──────────┘   └─────────┬──────────┘ └─────────┬──────────┘   └─────────┬──────────┘ └─────────┬──────────┘
          │                        │                      │                        │                      │
          └────────────────────────┼──────────────────────┼────────────────────────┼──────────────────────┘
                                   ▼                      ▼                        ▼
                        ┌─────────────────────────────────────────────────────────────────────┐
                        │                      INFRASTRUCTURE LAYER                           │
                        │  PostgreSQL (Port 5432/5433) | Redis (6379) | RabbitMQ (5672/15672) │
                        └─────────────────────────────────────────────────────────────────────┘
```

### 1. Identity Service (Port 3001)
- **Nhiệm vụ**: Xác thực, phân quyền (RBAC), quản lý người dùng, chi nhánh cửa hàng, khuyến mãi và hệ thống nhượng quyền thương hiệu (Franchise).
- **Cơ sở dữ liệu**: Schema `identity`.
- **Bảng thực thể chính**:
  - `user`: Thông tin tài khoản, mật khẩu băm, vai trò (`ADMIN`, `MANAGER`, `STAFF`, `CUSTOMER`, `SHIPPER`), điểm tích lũy, hạng thành viên (`BRONZE`, `SILVER`, `GOLD`, `DIAMOND`).
  - `branch`: Thông tin chi nhánh (tên, địa chỉ, số điện thoại, kinh độ/vĩ độ, trạng thái hoạt động).
  - `delivery_address`: Sổ địa chỉ nhận hàng của khách.
  - `promotion` & `promotion_usage`: Mã giảm giá, điều kiện áp dụng, lịch sử sử dụng voucher.
  - `ho_so_dang_ky`, `hop_dong`, `kiosk`, `combo_nguyen_lieu`, `don_mua_combo`, `royalty`, `cong_no`, `doi_soat`, `bien_ban_vi_pham`, `audit_log`: Toàn bộ phân hệ nhượng quyền Kiosk.
- **Bảo mật**: JWT Token (7 ngày hạn), AuthGuard, RolesGuard kiểm tra quyền.

### 2. Menu Service (Port 3003)
- **Nhiệm vụ**: Quản lý cây danh mục sản phẩm, món ăn, thức uống, biến thể size (S/M/L), độ ngọt, mức đá, topping đính kèm.
- **Cơ sở dữ liệu**: Schema `menu`.
- **Bảng thực thể chính**:
  - `danh_muc`: Phân loại nhóm món (Cà phê, Trà sữa, Freeze, Trà trái cây, Bánh ngọt...).
  - `san_pham`: Chi tiết món, giá gốc, hình ảnh minh họa, gắn cờ `is_hot`, `is_new`, trạng thái hiển thị.
  - `bien_the_san_pham`: Kích cỡ và mức giá chênh lệch.
  - `thuoc_tinh`: Tùy chọn topping (Trân châu trắng, Thạch cà phê, Kem cheese...).

### 3. Inventory Service (Port 3004)
- **Nhiệm vụ**: Quản lý kho nguyên vật liệu (hạt cà phê, sữa, đường, siro, ly tách) theo từng chi nhánh riêng biệt; cảnh báo khi mức tồn kho chạm ngưỡng tối thiểu.
- **Cơ sở dữ liệu**: Schema `inventory`.
- **Bảng thực thể chính**:
  - `inventory_item`: Mã nguyên liệu, tên, đơn vị tính, số lượng tồn kho theo chi nhánh, ngưỡng cảnh báo, giá nhập.

### 4. Order Service (Port 3005) ⭐
- **Nhiệm vụ**: Trọng tâm vận hành của toàn bộ hệ thống — xử lý giỏ hàng, đặt hàng, thanh toán trực tuyến, phân phối Shipper, khảo sát & đánh giá, ví khách hàng, tin nhắn hỗ trợ, thẻ quà tặng.
- **Cơ sở dữ liệu**: Schema `orders`.
- **Bảng thực thể chính**:
  - `don_hang` & `chi_tiet_don_hang`: Đơn đặt món, tổng tiền, chiết khấu, phí ship, trạng thái đơn (`CHO_XAC_NHAN`, `DANG_XU_LY`, `DANG_GIAO`, `HOAN_THANH`, `DA_HUY`), trạng thái thanh toán (`CHUA_THANH_TOAN`, `DA_THANH_TOAN`, `HOAN_TIEN`).
  - `giao_dich_thanh_toan`: Nhật ký thanh toán qua VNPay, SePay, Ví điện tử.
  - `nhan_vien_giao_hang` & `shipper_delivery`: Quản lý tài xế, tọa độ GPS hiện tại, phân công cuốc giao, thời gian giao hàng.
  - `danh_gia_san_pham` & `branch_review`: Đánh giá chất lượng đồ uống (sao + bình luận + ảnh) và chất lượng phục vụ tại quán.
  - `chat_conversation` & `chat_message`: Tin nhắn realtime giữa khách và CSKH.
  - `survey_form` & `survey_response`: Khảo sát trải nghiệm khách hàng định kỳ.
  - `customer_wallet`: Số dư ví điện tử, lịch sử nạp tiền/hoàn tiền.
  - `gift_card`: Thẻ quà tặng điện tử.
  - `yeu_thich_san_pham`: Danh sách món yêu thích của từng khách.

### 5. News Service (Port 3006)
- **Nhiệm vụ**: Đăng tải bài viết blog, tin tức khuyến mãi, văn hóa cà phê, hướng dẫn nhượng quyền, quản lý file media tải lên.
- **Cơ sở dữ liệu**: Schema `news`.
- **Thực thể chính**: `article` / `news`.

### 6. AI Service (Port 8000) ⭐
- **Nhiệm vụ**: Cung cấp trí tuệ nhân tạo phục vụ cá nhân hóa trải nghiệm và tối ưu vận hành:
  1. **Recommendation Engine (`cf_service.py`)**: Gợi ý món cá nhân hóa dựa trên Collaborative Filtering (Cosine Similarity) tính toán trên tương tác đa chiều (mua hàng, đánh giá sao, yêu thích, dùng voucher). Cơ chế Cold-Start tự động gợi ý món thịnh hành cho khách mới.
  2. **Demand Forecasting (`forecast_service.py`)**: Dự báo lượng đơn và doanh thu từng chi nhánh từ 1 đến 60 ngày tới sử dụng Facebook Prophet (kèm tính tuần hoàn mùa vụ) hoặc Holt-Winters Exponential Smoothing.
  3. **Behavior Analytics**: Phân tích biểu đồ khung giờ vàng mua hàng (Sáng, Trưa, Chiều, Tối), tỷ trọng thanh toán, phân khúc khách hàng.
  4. **AI Assistant (`groq_service.py` & Gemini)**: Trợ lý tư vấn đồ uống thông minh, nắm vững menu, voucher, chi nhánh, tự động phản hồi tự nhiên bằng tiếng Việt và có cơ chế fallback khi bị giới hạn hạn mức (Rate-limit).
- **Cơ sở dữ liệu**: Schema `ai` (`mo_hinh_ai`, `nhat_ky_suy_luan`).

### 7. API Gateway (Port 3000)
- **Nhiệm vụ**: Cổng tiếp nhận duy nhất cho toàn bộ Frontend/Mobile, phân luồng HTTP Request và hỗ trợ timeout mở rộng (120s) phục vụ các tác vụ AI & thanh toán.
- **Bảng định tuyến (Path Filtering)**:
  - `/auth`, `/users`, `/promotions`, `/franchise` ➔ `identity-service:3001`
  - `/menu` ➔ `menu-service:3003`
  - `/inventory` ➔ `inventory-service:3004`
  - `/cart`, `/orders`, `/chat`, `/customers`, `/staff`, `/manager`, `/products`, `/reviews`, `/branch-reviews`, `/surveys`, `/shippers`, `/vouchers`, `/sepay_webhook.php`, `/gift-cards` ➔ `order-service:3005`
  - `/news`, `/uploads/news` ➔ `news-service:3006`
  - `/ai` ➔ `ai-service:8000`

---

## 💾 4. CƠ SỞ DỮ LIỆU & BỘ NHỚ ĐỆM (DATA LAYER)

### 1. PostgreSQL Schema Mapping
Hệ thống sử dụng một Database PostgreSQL duy nhất (`avengers_coffee`), phân chia thành **6 Schemas độc lập** bảo đảm tính cô lập logic chuẩn Microservices:

```
Database: avengers_coffee
├── 📂 identity
│   ├── user (tài khoản, phân quyền, điểm tích lũy)
│   ├── branch (chi nhánh)
│   ├── delivery_address (sổ địa chỉ)
│   ├── promotion & promotion_usage (khuyến mãi)
│   ├── membership_config (cấu hình hạng thành viên)
│   └── [franchise tables]: ho_so_dang_ky, hop_dong, kiosk, combo_nguyen_lieu,
│       don_mua_combo, royalty, cong_no, doi_soat, bien_ban_vi_pham, audit_log
├── 📂 menu
│   ├── danh_muc (danh mục món)
│   ├── san_pham (sản phẩm, giá, hình ảnh, tag)
│   ├── bien_the_san_pham (biến thể size)
│   └── thuoc_tinh (topping, đường, đá)
├── 📂 inventory
│   └── inventory_item (kho nguyên vật liệu theo chi nhánh)
├── 📂 orders
│   ├── don_hang & chi_tiet_don_hang (đơn hàng & chi tiết món)
│   ├── giao_dich_thanh_toan (nhật ký thanh toán)
│   ├── nhan_vien_giao_hang & shipper_delivery (shipper & chuyến giao)
│   ├── cart & cart_item (giỏ hàng)
│   ├── danh_gia_san_pham & branch_review (đánh giá)
│   ├── survey_form & survey_response (khảo sát)
│   ├── chat_conversation & chat_message (chat trực tuyến)
│   ├── notification (thông báo)
│   ├── customer_wallet (ví tiền khách hàng)
│   ├── gift_card (thẻ quà tặng)
│   ├── yeu_thich_san_pham (món yêu thích)
│   └── ca_lam_viec_nhan_vien & ca_doi_soat (ca làm & kết ca)
├── 📂 news
│   └── article (tin tức, blog, truyền thông)
└── 📂 ai
    ├── mo_hinh_ai (registry lưu version, metrics MAE/RMSE, trạng thái huấn luyện)
    └── nhat_ky_suy_luan (inference logs ghi nhận độ trễ và kết quả dự đoán)
```

### 2. Redis Cache Strategy
- **Port**: `6379`
- **Các Key chính**:
  - `cart:{userId}`: Giỏ hàng tạm thời với tốc độ phản hồi < 5ms.
  - `session:{token}`: Quản lý phiên đăng nhập và xác thực tức thời.
  - `recommendation:{userId}`: Cache kết quả gợi ý món từ AI service (TTL: 30 phút).
  - `rate_limit:{ip}`: Giới hạn tần suất gọi API phòng chống DDoS/Spam.

### 3. RabbitMQ Message Queue
- **Port AMQP**: `5672` | **Management UI**: `15672` (User/Pass mặc định từ `.env`)
- **Exchanges & Topics**:
  - `orders.created`: Bắn sự kiện khi khách đặt đơn thành công ➔ kích hoạt thông báo cho thu ngân/bếp.
  - `orders.paid`: Xác nhận đã thanh toán ➔ kích hoạt tìm Shipper & trừ kho.
  - `orders.shipped`: Shipper đã lấy hàng ➔ gửi thông báo realtime cho khách hàng.
  - `notifications.*`: Kênh phân phối thông báo đẩy tới WebSocket Gateway.

---

## ⚡ 5. MODERN DATA PLATFORM 7 LỚP (DATA ARCHITECTURE)

Hệ thống tích hợp một **Modern Data Platform** hoàn chỉnh theo tiêu chuẩn Big Data của các doanh nghiệp lớn:

```
[Layer 1: Sources]      PostgreSQL (WAL/Transactions) | Web/Mobile Logs | Shipper GPS
                                    │
                                    ▼
[Layer 2: Ingestion]    Debezium CDC + Apache Kafka (Event Hub :9092)
                                    │
                                    ▼
[Layer 3: Processing]   Apache Spark (PySpark ETL Streaming & Nightly Batch)
                                    │
                                    ▼
[Layer 4: Lakehouse]    MinIO S3 Lakehouse (:9000/:9001)
                        🟤 Bronze (Raw Parquet) ➔ ⚪ Silver (Cleaned) ➔ 🟡 Gold (Aggregated)
                                    │
                                    ▼
[Layer 5: Query Engine] Apache Trino (Distributed SQL Engine)
                                    │
                                    ▼
[Layer 6: Orchestrate]  Apache Airflow (:8083) DAGs điều phối tự động
                                    │
                                    ▼
[Layer 7: Analytics]    Streamlit BI Dashboard (:8501) & Executive AI Insights
```

---

## 💻 6. ỨNG DỤNG FRONTEND & MOBILE (APPLICATIONS)

### 1. Web Customer (`apps/web-customer`)
- **Cổng chạy**: `5175` (Dev) hoặc `5173` (Nginx Prod).
- **Công nghệ**: React 19, Vite, Tailwind CSS, Heroicons, Socket.io-client, Axios.
- **Tính năng nổi bật**:
  - Đặt món thông minh: Xem menu theo danh mục, lọc món Hot/New, tùy biến size/topping, chọn chi nhánh gần nhất.
  - Giỏ hàng & Thanh toán đa phương thức: VNPay Sandbox (QR/ATM/Visa), Chuyển khoản SePay quét mã VietQR tự động khớp, COD, Trừ ví cá nhân, Thẻ quà tặng (GiftCard).
  - Trải nghiệm tương tác cao: Vòng quay may mắn trúng voucher (Lucky Wheel), Khảo sát trải nghiệm (Survey), Trò chuyện trực tuyến với CSKH (Live Chat), Đánh giá kèm hình ảnh.
  - Thông tin thành viên & Nhượng quyền: Tra cứu điểm tích lũy, đặc quyền hạng thẻ, trang đăng ký nhượng quyền (Franchise Portal) kèm tính toán chi phí mở quán.

### 2. Web Admin (`apps/web-admin`)
- **Cổng chạy**: `5174`.
- **Công nghệ**: React 19, Vite, Tailwind CSS, Lucide Icons, Recharts.
- **Phân hệ theo vai trò (Role-Based Views)**:
  - **`ADMIN`**: Quản trị toàn hệ thống, cấu hình tham số, giám sát mô hình AI, xem báo cáo tài chính hợp nhất.
  - **`MANAGER`**: Quản lý đơn hàng chi nhánh, duyệt nhập/xuất kho, phân công ca làm việc nhân viên, đối soát ca thu ngân.
  - **`STAFF`**: Giao diện POS bán hàng tại quầy cảm ứng mượt mà, tạo đơn nhanh, in phiếu pha chế.
  - **`FRANCHISE_MANAGER`**: Quản lý hồ sơ đối tác, hợp đồng nhượng quyền Kiosk, đơn mua combo nguyên liệu, tính phí bản quyền (Royalty), theo dõi công nợ đại lý.

### 3. Web Shipper & Shipper Launcher (`apps/web-shipper` & `apps/shipper-launcher`)
- **Cổng chạy**: `5175` / `5176`.
- **Công nghệ**: React 18, Vite, Recharts, Lucide Icons, Socket.io.
- **Tính năng**: Bản đồ nhận đơn giao hàng, theo dõi đơn cần lấy tại quán, cập nhật trạng thái đơn hàng (Đã lấy hàng ➔ Đang giao ➔ Giao thành công), thống kê cuốc xe và thu nhập theo ngày/tuần.

### 4. Ứng dụng Di động (`customer-mobile`, `shipper-mobile`, `admin-mobile`)
- **Công nghệ**: React Native, Expo SDK, React Navigation, AsyncStorage.
- **Đặc điểm**:
  - `customer-mobile`: Đặt món nhanh trên điện thoại, tích điểm bằng mã QR thành viên, nhận thông báo trạng thái đơn hàng.
  - `shipper-mobile`: Nhận thông báo cuốc giao mới qua Socket, gửi tọa độ GPS định kỳ về máy chủ, chụp ảnh xác nhận đã giao hàng.
  - `admin-mobile`: Theo dõi doanh thu thời gian thực của chuỗi trên smartphone.

---

## 🔄 7. CÁC QUY TRÌNH NGHIỆP VỤ CỐT LÕI (CORE WORKFLOWS)

### 1. Quy trình Đặt hàng & Thanh toán (End-to-End Order Flow)
```
1. Khách hàng thêm món vào giỏ ➔ POST /cart/items ➔ Lưu Redis Cache & DB
2. Khách bấm Thanh toán ➔ POST /customers/{id}/order (chọn phương thức)
   ├── [Nếu chọn VNPay]:
   │   ├── Hệ thống tạo mã giao dịch, sinh chữ ký HMAC-SHA512
   │   ├── Trả về URL thanh toán VNPay Sandbox
   │   └── Khách thanh toán xong ➔ Redirect về Callback ➔ Cập nhật ĐÃ THANH TOÁN
   ├── [Nếu chọn SePay (VietQR)]:
   │   ├── Sinh mã QR chuyển khoản chứa mã đơn hàng trong nội dung
   │   └── Khách chuyển tiền ➔ SePay Webhook bắn vào /sepay_webhook.php ➔ Tự động khớp & ĐÃ THANH TOÁN
   └── [Nếu chọn COD]: Đơn tạo với trạng thái CHỜ XÁC NHẬN / CHƯA THANH TOÁN
3. Đơn hàng hợp lệ ➔ Bắn sự kiện RabbitMQ `orders.created`
4. WebSocket Gateway gửi thông báo tới màn hình POS Quản lý & Thu ngân tại chi nhánh
5. Hệ thống tìm kiếm Shipper khả dụng trong bán kính gần nhất ➔ Gửi thông báo nhận cuốc
6. Shipper nhận đơn ➔ Lấy món ➔ Giao hàng ➔ Khách nhận & Hoàn tất
7. Khách hàng đánh giá sao / bình luận ➔ Tích điểm thưởng hạng thành viên
```

### 2. Quy trình Quản lý Nhượng quyền (Franchise Lifecycle)
```
1. Đối tác điền Form đăng ký tại Web Customer ➔ Lưu `identity.ho_so_dang_ky`
2. Admin duyệt hồ sơ ➔ Ký hợp đồng điện tử ➔ Tạo bản ghi `identity.hop_dong`
3. Cấp mã Kiosk hoạt động ➔ Tạo `identity.kiosk`
4. Đối tác Kiosk đặt mua Combo nguyên liệu định kỳ ➔ `identity.don_mua_combo`
5. Vận hành hàng tháng ➔ Tự động tính phí bản quyền thương hiệu ➔ `identity.royalty`
6. Kiểm tra & Giám sát Kiosk ➔ Ghi nhận biên bản vi phạm nếu sai chuẩn ➔ `identity.bien_ban_vi_pham`
```

### 3. Quy trình Huấn luyện & Gợi ý AI (AI Pipeline)
```
1. Huấn luyện (Training):
   ├── Định kỳ (mỗi 60 phút hoặc chạy lệnh ban đêm qua Airflow DAG)
   ├── Trích xuất dữ liệu: Đơn hàng, Đánh giá, Yêu thích, Khuyến mãi từ schema `orders`
   ├── Xây dựng ma trận tương tác User-Item có gán trọng số
   ├── Tính toán độ tương đồng Cosine giữa các sản phẩm
   └── Lưu metadata, điểm đánh giá mô hình vào `ai.mo_hinh_ai`
2. Suy luận (Inference):
   ├── Client gọi GET /ai/recommend/{userId}
   ├── Nếu khách mới (Cold-Start) ➔ Trả về danh sách món thịnh hành nhất
   ├── Nếu khách cũ ➔ Tính điểm gợi ý từ lịch sử tương tác ➔ Trả về Top N món kèm lý do
   └── Ghi nhận log suy luận vào `ai.nhat_ky_suy_luan`
```

---

## 🌐 8. MA TRẬN KẾT NỐI REALTIME (WEBSOCKET & SOCKET.IO)

Hệ thống WebSocket được tổ chức theo các Rooms chuẩn mực trong `order-service`:

| Tên Room | Đối tượng tham gia | Mục đích sử dụng |
|---|---|---|
| `user__{userId}` | Khách hàng cụ thể | Nhận thông báo trạng thái đơn hàng cá nhân, tích điểm, voucher mới |
| `workforce__{branchCode}` | Quản lý & Nhân viên chi nhánh | Nhận thông báo đơn đặt món mới tại quầy/online, cảnh báo kho |
| `shipper__{shipperId}` | Tài xế cụ thể | Nhận cuốc giao hàng được điều phối, thông báo hủy/đổi cuốc |
| `support_MANAGER` | Quản lý hỗ trợ CSKH | Nhận các cuộc trò chuyện yêu cầu hỗ trợ từ khách hàng |
| `support_STAFF` | Nhân viên CSKH | Phân công phản hồi tin nhắn trực tuyến với khách |

---

## ⚙️ 9. QUY CHUẨN THIẾT KẾ & UI/UX (MANDATORY RULES)

Tất cả các thành phần giao diện (Web Customer, Web Admin, Web Shipper, Mobile Apps) khi xây dựng hoặc sửa đổi **BẮT BUỘC PHẢI TUÂN THỦ NGHIÊM NGẶT CÁC NGUYÊN TẮC SAU**:

1. **Icon chuẩn mực**:
   - ❌ **KHÔNG** sử dụng các icon thô sơ, icon có sẵn mặc định của trình duyệt hay emoji bừa bãi.
   - ✅ **BẮT BUỘC** sử dụng các thư viện icon vector chất lượng cao: **Lucide Icons** (`lucide-react`) hoặc **Heroicons** hoặc icon **SVG tùy chỉnh** sắc nét.

2. **Chữ viết & Ngôn ngữ hiển thị**:
   - ❌ **KHÔNG** hiển thị các ký tự code, biến lập trình (như gạch dưới `_`, dấu gạch chéo `/`, mã enum thô `PENDING_PAYMENT`, `CHO_XAC_NHAN`).
   - ✅ **BẮT BUỘC** hiển thị tiếng Việt có dấu chuẩn giao diện người dùng (Ví dụ: *"Chờ xác nhận"*, *"Đang giao hàng"*, *"Đã thanh toán"*).

3. **Màu sắc nút bấm theo chuẩn tâm lý học UX/UI**:
   - 🔴 **Hành động nguy hiểm / Hủy / Xóa**: Nền hoặc viền **Đỏ** (`#EF4444`, `#DC2626`).
   - 🟢 **Hành động xác nhận / Lưu / Hoàn thành / Đồng ý**: Nền **Xanh lá** (`#10B981`, `#059669`).
   - 🔵 **Hành động xem chi tiết / Chỉnh sửa / Điều hướng**: Nền **Xanh dương** hoặc màu thương hiệu (`#3B82F6`, `#2563EB`).
   - ☕ **Màu chủ đạo thương hiệu Avengers Coffee**: Đỏ đô / Đỏ Ruby (`#C41230`) kết hợp Vàng ánh kim (`#F59E0B`) và Nâu cà phê thượng hạng (`#3E2723`).

4. **Trạng thái tương tác & Trực quan**:
   - Nút bấm và Tab lựa chọn **phải có màu nền/màu chữ rõ ràng**, có hiệu ứng **Active / Selected** (nổi bật, viền sáng hoặc đổi màu nền khi được chọn).
   - Font chữ mềm mại, hiện đại (Inter, Roboto, Plus Jakarta Sans).
   - Khoảng cách (spacing), padding, margin chuẩn lưới (Grid 8px), đổ bóng tinh tế (Soft Shadow), bo góc mềm mại (`rounded-xl` / `rounded-2xl`).

---

## 🚀 10. HƯỚNG DẪN VẬN HÀNH & LỆNH ĐIỀU KHIỂN (OPERATIONS GUIDE)

### 1. Khởi động toàn bộ Hệ thống Chính (Microservices + Frontend)
```powershell
# Chạy toàn bộ services ở chế độ nền
docker compose up -d

# Xem trạng thái các container
docker compose ps

# Xem log của một service cụ thể (ví dụ order-service hoặc ai-service)
docker compose logs -f order-service
docker compose logs -f ai-service
```

### 2. Khởi động Tầng Data Platform (Kafka, Spark, Airflow, MinIO, Streamlit)
```powershell
# Khởi động cụm Data Lakehouse, Kafka, Streamlit
docker compose -f docker-compose.data.yml up -d

# Khởi động kèm công cụ quản trị (Kafka-UI, Airflow Webserver)
docker compose -f docker-compose.data.yml --profile tools up -d

# Truy cập Streamlit Analytics Dashboard
# http://localhost:8501
```

### 3. Sao lưu & Phục hồi Cơ sở dữ liệu (Database Backup / Restore)
```powershell
# Thực hiện sao lưu dữ liệu toàn bộ PostgreSQL
.\scripts\db-backup.ps1

# Phục hồi dữ liệu từ bản backup
.\scripts\db-restore.ps1 -BackupFile .\scripts\backups\avengers_coffee_backup_YYYYMMDD.sql.gz

# Sinh dữ liệu hành vi người dùng giả lập phục vụ huấn luyện AI
.\scripts\seed-behavior-data.ps1
```

### 4. Danh sách Port mặc định của các Dịch vụ
| Dịch vụ | Cổng Port | Mục đích |
|---|---|---|
| **API Gateway** | `3000` | Cổng HTTP API duy nhất tiếp nhận request |
| **Identity Service** | `3001` | Auth, User, Franchise |
| **Menu Service** | `3003` | Danh mục & Món ăn |
| **Inventory Service** | `3004` | Kho hàng & Nguyên vật liệu |
| **Order Service** | `3005` | Đơn hàng, Thanh toán, Socket.io |
| **News Service** | `3006` | Tin tức, Bài viết |
| **AI Service** | `8000` | FastAPI AI Engine |
| **Web Customer** | `5175` / `5173` | Giao diện khách hàng |
| **Web Admin** | `5174` | Giao diện quản trị |
| **Web Shipper** | `5175` | Giao diện tài xế |
| **Shipper Launcher** | `5176` | Cổng chuyển tiếp shipper |
| **Streamlit BI** | `8501` | Analytics & AI Dashboard |
| **MinIO Console** | `9001` | Quản trị Lakehouse Object Storage |
| **RabbitMQ UI** | `15672` | Quản trị hàng đợi tin nhắn |
| **Airflow UI** | `8083` | Quản trị luồng ETL DAG |
| **PostgreSQL** | `5433` (Host) / `5432` | Cơ sở dữ liệu quan hệ |
| **Redis** | `6379` | Bộ nhớ đệm tốc độ cao |

---

> 💡 **Dành cho AI Agent**: Bất kỳ khi nào thực hiện tác vụ mới trên dự án này, hãy luôn đối chiếu cấu trúc thư mục, quy chuẩn đặt tên, schema database và quy tắc UI/UX trong tài liệu này để bảo đảm tính đồng nhất và chính xác 100%.
