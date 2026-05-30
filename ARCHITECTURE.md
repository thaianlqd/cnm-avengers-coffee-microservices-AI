# Avengers Coffee - System Architecture

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [Microservices](#microservices)
3. [Data Layer](#data-layer)
4. [Frontend Architecture](#frontend-architecture)
5. [AI/ML Pipeline](#aiml-pipeline)
6. [Request Flow](#request-flow)
7. [Message Queue](#message-queue)
8. [Security Architecture](#security-architecture)

---

## High-Level Overview

**Avengers Coffee** is a Vietnamese coffee shop ordering and delivery platform built on microservices architecture. The system handles:
- Customer ordering and payment
- Shipper/delivery management
- Inventory and menu management
- AI-powered recommendations and demand forecasting
- Real-time notifications and chat

### Core Technologies
- **Backend**: NestJS (Node.js) + FastAPI (Python)
- **Database**: PostgreSQL (single instance, multi-schema)
- **Cache**: Redis
- **Message Queue**: RabbitMQ
- **Frontend**: React (Vite) + React Native (Expo)
- **API Gateway**: NestJS (http-proxy-middleware)
- **Containerization**: Docker & Docker Compose

---

## Microservices

### 1. Identity Service (Port 3001)

**Responsibility**: Authentication, authorization, user management

**Key Entities**:
- `User` — customer/staff/admin accounts
- `Branch` — store locations
- `DeliveryAddress` — customer delivery addresses
- `Promotion` — discount codes/vouchers
- `PromotionUsage` — usage tracking

**Endpoints** (via gateway):
```
POST   /auth/register              Create account
POST   /auth/login                 Authenticate (returns JWT)
POST   /auth/google                Google OAuth
POST   /auth/facebook              Facebook OAuth
PATCH  /users/{id}                 Update profile
GET    /users/workforce            List staff
```

**Authentication**:
- JWT-based, 7 days expiry (configurable)
- Global JWT guard on all protected routes
- Role-based access control (ADMIN, MANAGER, STAFF, CUSTOMER)

**Integration**:
- Calls: None directly
- Called by: All services (JWT validation)

---

### 2. Menu Service (Port 3003)

**Responsibility**: Product catalog, categories, pricing

**Key Entities**:
- `Product` (san_pham) — items with price, category, images
- `Category` (danh_muc) — product grouping

**Endpoints**:
```
GET    /menu/products              List all products
GET    /menu/categories            List categories
POST   /menu/products              Create product (admin)
PUT    /menu/products/{id}         Update product (admin)
DELETE /menu/products/{id}         Delete product (admin)
```

**Features**:
- Hot/New flags for featured items
- Image upload support
- Status filtering (active/inactive)

**Integration**:
- Called by: AI Service (for recommendations, insights)

---

### 3. Inventory Service (Port 3004)

**Responsibility**: Stock tracking, ingredient management

**Key Entities**:
- `InventoryItem` — stock levels per branch

**Endpoints**:
```
GET    /inventory/items            List inventory
POST   /inventory/items            Add stock
PATCH  /inventory/items/{id}       Update stock
```

**Features**:
- Per-branch inventory management
- Low-stock alerts (via RabbitMQ)

**Integration**:
- Called by: Order Service (for stock deduction)

---

### 4. Order Service (Port 3005) ⭐ Most Complex

**Responsibility**: Order management, payments, shipping, chat, notifications

**Key Entities**:
- `Order` (don_hang) — main order record
- `OrderDetail` (chi_tiet_don_hang) — line items
- `PaymentTransaction` (giao_dich_thanh_toan) — payment records
- `Shipper` (nhan_vien_giao_hang) — delivery personnel
- `ShipperDelivery` — order-to-shipper assignment
- `CartItem` — shopping cart
- `Review` — product ratings
- `ChatMessage` — customer-support chat
- `Notification` — push notifications

**Endpoints** (Selection):
```
POST   /cart/items                 Add to cart
GET    /customers/{id}/cart        Get cart
POST   /customers/{id}/order       Create order
GET    /customers/{id}/orders      Order history
POST   /customers/thanh-toan/...   Payment checkout (VNPay/SePay/COD)
GET    /customers/.../trang-thai   Check payment status
GET    /shippers/{id}/deliveries   Get delivery jobs
POST   /shippers/{id}/delivery/... Update delivery status
POST   /products/{id}/review       Submit review
```

**Features**:
- **Shopping Cart**: Session-based, persistent via Redis
- **Payment Integration**:
  - VNPay (credit/debit card, sandbox)
  - SePay (bank transfer via webhook)
  - COD (cash on delivery)
- **Real-Time Updates**:
  - WebSocket (Socket.io) for notifications
  - Rooms: `userId`, `workforce:branchCode`, `support:MANAGER`
- **Chat**: Real-time customer-support messaging
- **Shipper Management**:
  - GPS location tracking
  - Status: PENDING → CONFIRMED → PICKING_UP → IN_TRANSIT → DELIVERED
  - Rating & earnings tracking

**Dependencies**:
- PostgreSQL (orders schema)
- Redis (cart caching, session)
- RabbitMQ (notification broadcast)
- Identity Service (JWT validation, user lookup)
- Inventory Service (stock check)

**Integration**:
- Called by: AI Service (for behavior analysis, recommendations)
- Calls: Identity Service, Inventory Service

---

### 5. News Service (Port 3006)

**Responsibility**: Blog, articles, content management

**Key Entities**:
- `Article` — blog posts with title, content, images

**Endpoints**:
```
GET    /news/articles              List articles
GET    /news/articles/{id}         Get article detail
POST   /news/articles              Create article (admin)
PUT    /news/articles/{id}         Update article
DELETE /news/articles/{id}         Delete article
```

**Features**:
- Image upload to shared storage
- Status and publish date management

**Integration**:
- Called by: Frontend (for news feed)

---

### 6. AI Service (Port 8000) ⭐ Data Science & ML

**Technology**: FastAPI (Python 3.11) + scikit-learn + Pandas + Prophet

**Core Models**:

#### A. Collaborative Filtering (Recommendation Engine)
- **Algorithm**: Item-based cosine similarity
- **Data Signals**:
  - Order history (quantity, recency bonus)
  - Product ratings (⭐ 1-5 scale)
  - Favorites (high intent signal)
  - Promotional usage (price sensitivity)
- **Output**: Top N recommendations per user with scores
- **Cold-Start**: Fallback to popularity ranking
- **Auto-Retrain**: Every 60 minutes (throttled by 120s cooldown)

#### B. Demand Forecasting
- **Algorithms**:
  - Primary: Facebook Prophet (if installed)
  - Fallback: Holt-Winters triple exponential smoothing (pure NumPy)
- **Forecasts**:
  - Per-branch daily order count
  - Per-branch daily revenue
  - 1-60 days ahead with confidence intervals
- **Features**:
  - Weekly seasonality detection
  - Trend analysis
  - Insufficient data detection
- **Training**: Daily, on 7-180 day historical data

#### C. Behavior Insights
- **Queries**:
  - Top-selling products
  - Customer sync score (weighted by purchases, ratings, favorites, vouchers)
  - Payment method mix (VNPAY vs COD vs NGAN_HANG)
  - Hour-of-day distribution (SANG/TRUA/CHIEU/TOI)
  - Top-rated products
  - Top favorites
  - Top promotional products

#### D. Gemini AI Chat
- **Integration**: Google Generative Language API
- **Features**:
  - Context-aware responses (products, promotions, branches, order history)
  - Continuation logic: Auto-extend if incomplete responses
  - Fallback: Local template-based replies when Gemini is quota-limited
  - Rate limiting: 429 handling blocks Gemini for 10 minutes
  - Sanitization: Hides API keys in error logs

**Endpoints**:
```
GET  /ai/model/stats              Training status of all models
GET  /ai/recommend/{user}         Top N product recommendations
GET  /ai/forecast/combined        Demand forecast for branch + metric
GET  /ai/behavior/insights        Customer behavior analysis
POST /ai/chat                      Gemini-powered chat
POST /ai/recommend/train          Trigger CF retraining
POST /ai/forecast/train           Trigger forecast retraining
```

**Data Flow**:
1. Training: Queries Orders, OrderDetails, Ratings, Favorites from order-service schema
2. Inference: Real-time scoring; logs to `ai.nhat_ky_suy_luan` table
3. Registry: `ai.mo_hinh_ai` stores model metadata (version, training time, metrics)

**Integration**:
- Called by: Frontend, API Gateway
- Calls: PostgreSQL (order schema), Gemini API

---

## Data Layer

### Database: PostgreSQL (Single Instance, 5 Schemas)

```
Database: avengers_coffee
├── identity schema
│   ├── user
│   ├── delivery_address
│   ├── branch
│   ├── promotion
│   └── promotion_usage
├── menu schema
│   ├── san_pham (products)
│   └── danh_muc (categories)
├── inventory schema
│   └── inventory_item
├── orders schema
│   ├── don_hang (orders)
│   ├── chi_tiet_don_hang (order details)
│   ├── giao_dich_thanh_toan (payments)
│   ├── ca_lam_viec_nhan_vien (staff shifts)
│   ├── ca_doi_soat (reconciliation)
│   ├── nhan_vien_giao_hang (shippers)
│   ├── shipper_delivery
│   ├── yeu_thich_san_pham (favorites)
│   ├── danh_gia_san_pham (reviews)
│   ├── chat_conversation
│   ├── chat_message
│   ├── cart
│   └── voucher
└── ai schema
    ├── mo_hinh_ai (model registry)
    └── nhat_ky_suy_luan (inference logs)
```

**Connection**: All services use `postgres://admin:password@postgres-db:5432/avengers_coffee`

**ORM**: TypeORM (NestJS services) with auto-sync (no migrations)

### Cache: Redis
- **Purpose**: Session caching, cart data, rate limiting
- **Keys**: `cart:userId`, `session:token`, recommendation cache
- **TTL**: Configurable per entity
- **Health Check**: Every 10 seconds

### Message Queue: RabbitMQ
- **Purpose**: Async notifications, order broadcasts, payment confirmations
- **Exchanges**:
  - `orders` — order status updates
  - `payments` — payment confirmations
  - `notifications` — push notifications to WebSocket clients
- **Consumers**: Order Service (broadcasts to WebSocket rooms)

---

## Frontend Architecture

### Web Customer (React 19 + Vite)
- **Entry**: `src/main.jsx` → React Query setup
- **Pages**: Product browsing, cart, checkout, order tracking, reviews
- **Auth**: Google OAuth, Facebook login, email/password signup
- **UI**: Tailwind CSS 4.2, Heroicons
- **API Client**: Axios with interceptors
- **Real-Time**: Socket.io for order updates

**Build Output**: Static HTML/CSS/JS served by Nginx on port 5173

### Web Admin (React 19 + Vite)
- **Purpose**: Admin dashboard for order/menu/user management
- **Pages**: Orders, Products, Users, Reports, Settings
- **Auth**: JWT from Identity Service
- **UI**: Minimal styling (framework ready)
- **API Client**: Custom `adminFetch` interceptor with auth

### Web Shipper (React 18 + Vite)
- **Purpose**: Delivery tracking & job assignment
- **Components**: Recharts (analytics), Lucide (icons), Toast notifications
- **Pages**: Dashboard, Deliveries, Map, Earnings, Profile
- **Real-Time**: Socket.io for new delivery jobs
- **Mapping**: (Prepared for map integration)

### Shipper Mobile (React Native + Expo)
- **Platform**: Android (iOS via EAS build)
- **Entry**: `App.js` → Navigation setup
- **Navigation**: Bottom tab navigator (Deliveries, Home, Earnings, Profile)
- **API**: Custom hooks for fetching and real-time updates
- **Storage**: AsyncStorage for credentials and cache
- **Demo Account**: `shipper_demo` / `123456`

---

## AI/ML Pipeline

### Training Pipeline
```
1. Daily (or on-demand trigger):
   ├── CollaborativeFilter.train()
   │   ├── Fetch orders + interactions from orders schema
   │   ├── Fetch ratings, favorites, promotions
   │   ├── Compute user-item matrix (weighted scores)
   │   ├── Calculate item-item cosine similarity
   │   └── Store metadata in ai.mo_hinh_ai
   └── DemandForecast.train()
       ├── Fetch daily order counts & revenue per branch
       ├── Fit Prophet (or Holt-Winters)
       ├── Store model state
       └── Update training timestamp

2. Registry Sync:
   └── upsert_model_registry() → ai.mo_hinh_ai table
       ├── model_name: "goi_y_ca_nhan_hoa" (CF)
       ├── model_name: "du_bao_nhu_cau" (Forecast)
       ├── is_trained, total_records, metrics
       └── trained_at timestamp
```

### Inference Pipeline
```
1. User requests /ai/recommend/{user_id}:
   ├── Check if user in training set (has_user_history)
   ├── If new user → return popular items (cold-start fallback)
   ├── Otherwise:
   │   ├── Get user's historical interactions
   │   ├── Score all items via item-item similarity
   │   ├── Rank and filter (remove already-seen)
   │   └── Return top N with scores + reasons
   └── Log inference to ai.nhat_ky_suy_luan

2. User requests /ai/chat:
   ├── Fetch base context (top products, promos, branches)
   ├── Fetch user's recent orders
   ├── Build system prompt (role: "coffee advisor")
   ├── Build user prompt (context + question)
   ├── Call Gemini API
   ├── If incomplete response:
   │   ├── Continuation round(s) (up to AI_CHAT_MAX_CONTINUATION_ROUNDS)
   │   └── Merge responses without overlap
   └── Log inference + response

3. User requests /ai/behavior/insights:
   ├── Run complex SQL aggregate queries
   ├── Calculate weighted product scores
   ├── Return multi-faceted analysis (top products, payment mix, hour distribution)
   └── Log request
```

---

## Request Flow

### Order Creation (End-to-End)
```
1. Customer adds items to cart:
   POST /cart/items
   ├── Web Customer (React) → API Gateway
   ├── API Gateway → Order Service
   ├── Order Service stores in Redis (cached cart)
   └── Response: {cartId, items, total}

2. Customer checkout:
   POST /customers/{id}/thanh-toan/khoi-tao
   ├── API Gateway → Order Service
   ├── Order Service:
   │   ├── Validate cart items
   │   ├── Check inventory (via Inventory Service)
   │   ├── Create Order (don_hang) in DB
   │   ├── If payment method = VNPAY:
   │   │   ├── Generate VNPay signature
   │   │   └── Redirect to VNPay checkout
   │   ├── If payment method = COD:
   │   │   ├── Set status = PENDING_PAYMENT
   │   │   └── Assign shipper (in background)
   │   └── Return payment URL or confirmation

3. Payment callback (if VNPay):
   GET /customers/.../vnpay/ket-qua?vnp_TxnRef=ORDER123&vnp_Amount=...
   ├── API Gateway → Order Service
   ├── Order Service:
   │   ├── Verify HMAC signature with VNPAY_HASH_SECRET
   │   ├── Update PaymentTransaction record
   │   ├── If success: mark Order as PAID
   │   ├── Broadcast to WebSocket room (userId)
   │   └── Send notification via RabbitMQ
   └── Response: Success page or error

4. Real-time notification:
   ├── RabbitMQ publishes order status change
   ├── Order Service WebSocket listener receives
   ├── Broadcasts to room (userId)
   └── Web Customer (Socket.io) receives → updates UI

5. Shipper assignment:
   ├── Order marked as PAID
   ├── Background task: Find available shipper
   ├── Create ShipperDelivery record
   ├── Broadcast to WebSocket room (workforce:branchCode)
   ├── Shipper Mobile (Expo) receives notification
   └── Shipper accepts delivery
```

### AI Recommendation Flow
```
1. Customer views product page:
   GET /ai/recommend/user_123
   ├── Web Customer → API Gateway
   ├── API Gateway → AI Service
   ├── AI Service:
   │   ├── Check if CF model is trained
   │   ├── If not trained: fetch popular items fallback
   │   ├── Otherwise: compute similarity-based scores
   │   ├── Fetch product details from order schema cache
   │   └── Return top 3-6 items with scores + reasons
   ├── Log inference (endpoint, user, status, latency, response)
   └── Response to frontend with items + reasons

2. If Gemini quota exceeded:
   ├── AI Service marks Gemini as blocked (for 10 min)
   ├── Subsequent /ai/chat calls use local fallback
   ├── Fallback response uses base context templates
   └── After 10 min: retry Gemini
```

---

## Message Queue

### RabbitMQ Topics & Subscribers

| Topic | Event | Publisher | Subscriber |
|-------|-------|-----------|------------|
| `orders.created` | Order placed | Order Service | Order Service (webhook handler) |
| `orders.paid` | Payment confirmed | Order Service | Order Service (shipper assignment) |
| `orders.shipped` | Delivery started | Order Service | WebSocket (broadcast to customer) |
| `orders.delivered` | Delivery completed | Order Service | WebSocket (broadcast + notifications) |
| `notifications.*` | Real-time updates | Order Service | WebSocket Gateway |

### WebSocket Rooms (Socket.io)

| Room | Purpose | Subscribers |
|------|---------|-------------|
| `user__{userId}` | Personal notifications | Customer (web/mobile) |
| `workforce__{branchCode}` | Staff notifications | Staff/Managers at branch |
| `support_MANAGER` | Support tickets | Support managers |
| `support_STAFF` | Support assignments | Support staff |

---

## Security Architecture

### Authentication & Authorization
- **Method**: JWT (HS256)
- **Issuer**: Identity Service
- **Claims**: `userId`, `role`, `branches`
- **Guard**: Global JWT guard; `@Public()` decorator for open endpoints
- **Roles**:
  - `ADMIN` — full system access
  - `MANAGER` — branch operations
  - `STAFF` — order fulfillment
  - `CUSTOMER` — ordering & account

### API Gateway Security
- **CORS**: Enabled globally (⚠️ should restrict to known origins in production)
- **Rate Limiting**: None (⚠️ should add throttler)
- **Proxy**: http-proxy-middleware with changeOrigin

### Payment Security
- **VNPay**: HMAC-SHA512 signature verification
- **SePay**: Webhook signature verification (custom)
- **Secrets**: Stored in .env, passed via compose variables

### Data Protection
- **Encryption**: No TLS in local setup (add in production)
- **Secrets**: API keys, payment secrets in .env only
- **Logging**: Sanitizes API keys in error logs

---

## Deployment Architecture (Production)

```
                        ┌─────────────────────┐
                        │   Load Balancer     │
                        │  (nginx/Traefik)    │
                        └──────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
         ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
         │  K8s Node 1 │   │  K8s Node 2 │   │  K8s Node 3 │
         ├─────────────┤   ├─────────────┤   ├─────────────┤
         │ Gateway Pod │   │ Gateway Pod │   │ Gateway Pod │
         │ Services    │   │ Services    │   │ Services    │
         └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
                    ▼                            ▼
            ┌──────────────┐            ┌──────────────────┐
            │  PostgreSQL  │            │  Redis Cluster   │
            │  Primary     │            │  + Sentinel      │
            │  Replica 1,2 │            │                  │
            └──────────────┘            └──────────────────┘
                    │
                    ▼
            ┌──────────────┐
            │  Backup NFS  │
            │  Storage     │
            └──────────────┘
```

**Deployment Files**: See `avengers-coffee-system/deployments/` for K8s YAML manifests.

---

## Performance Considerations

### Database Optimization
- Indexes on: `user_id`, `ma_san_pham`, `ngay_tao` (orders)
- Connection pooling: 10-20 per service
- Query caching: Redis for popular products, recommendations

### AI Model Performance
- CF training: 5-30 seconds (depends on interaction volume)
- Forecast training: 10-60 seconds (depends on history)
- Recommendation inference: <100ms per request
- Gemini API: 2-5 second latency (external API)

### Scaling Strategy
- **Horizontal**: API Gateway + services behind load balancer
- **Vertical**: Increase container CPU/memory for heavy compute (AI Service)
- **Caching**: Redis for hottest data (carts, sessions, product lists)

---

## Monitoring & Observability

### Metrics to Track
- **API**: Request count, latency, error rate per endpoint
- **Database**: Connection pool usage, query latency
- **AI**: Model training time, inference latency, cache hit rate
- **Business**: Order count, revenue, shipper utilization

### Logging
- **Centralization**: Ship logs to ELK, Datadog, or CloudWatch
- **Levels**: INFO (events), WARNING (anomalies), ERROR (failures)
- **Redaction**: Strip PII, payment details, API keys

### Alerting
- Database replication lag > 10s
- AI model training failure
- Payment processing errors > 5% failure rate
- API Gateway 5xx errors > 1%

---

**Last Updated**: May 29, 2026  
**Version**: 1.0  
**Status**: ✅ Production-Ready (with security fixes applied)
