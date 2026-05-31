# Avengers Coffee - Project Setup Guide

## Prerequisites

- **Docker** 20.10+ and **Docker Compose** 2.0+
- **PowerShell** 5.1+ (for Windows scripts)
- **Node.js** 20+ (for frontend dev)
- **Python** 3.11+ (for AI service dev)
- **Git** for version control

---

## Quick Start (5 minutes)

### 1. Clone Repository
```bash
git clone https://github.com/your-org/cnm-avengers-coffee-microservices-AI.git
cd cnm-avengers-coffee-microservices-AI
```

### 2. Setup Environment
```bash
# Copy template
cp .env.example .env

# Edit .env and set these REQUIRED variables:
# - POSTGRES_PASSWORD (generate: openssl rand -base64 32)
# - JWT_SECRET (generate: openssl rand -base64 32)
# - GEMINI_API_KEY (get from https://makersuite.google.com/app/apikey)
```

**On Windows (PowerShell):**
```powershell
# Generate secrets safely
$postgresPassword = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((New-Guid).ToString()))
$jwtSecret = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((New-Guid).ToString()))

# Print for copying to .env
Write-Host "POSTGRES_PASSWORD=$postgresPassword"
Write-Host "JWT_SECRET=$jwtSecret"
```

### 3. Start Services
```bash
# Build and start all containers
docker-compose up -d

# Wait ~30 seconds for database migrations
sleep 30

# Verify all services are running
docker-compose ps
```

### 4. Access Applications

| Service | URL | Port |
|---------|-----|------|
| **API Gateway** | http://localhost:3000 | 3000 |
| **Web Customer** | http://localhost:5173 | 5173 |
| **Web Admin** | http://localhost:5174 | 5174 |
| **Web Shipper** | http://localhost:5175 | 5175 |
| **Shipper Launcher** | http://localhost:5176 | 5176 |
| **RabbitMQ Management** | http://localhost:15672 | 15672 |

---

## Detailed Setup

### Environment Configuration

#### Required Variables (No Defaults)
```env
# AI Service
GEMINI_API_KEY=sk-...  # From https://makersuite.google.com/app/apikey

# Authentication
JWT_SECRET=<strong_random_value>  # 32+ characters
POSTGRES_PASSWORD=<strong_random_value>
```

#### Production-Only Variables
```env
# OAuth Integration
GOOGLE_APP_SECRET=...
FACEBOOK_APP_SECRET=...
RECAPTCHA_SECRET_KEY=...

# Payment Gateway
VNPAY_HASH_SECRET=<production_value>
SEPAY_WEBHOOK_SECRET=<production_value>

# Email
SMTP_PASS=<app_specific_password>
```

#### Optional Variables (Have Defaults)
```env
# Ports
GATEWAY_PORT=3000
IDENTITY_PORT=3001
MENU_PORT=3003
AI_PORT=8000

# URLs (for frontends in docker)
WEB_CUSTOMER_API_URL=http://localhost:3000
WEB_CUSTOMER_SOCKET_URL=http://localhost:3005
```

See [.env.example](.env.example) for complete list.

---

## Database Management

### View Database

```powershell
# Connect to PostgreSQL
docker exec -it avengers_db psql -U admin -d avengers_coffee

# List schemas
\dn

# List tables in schema
\dt identity.*
\dt menu.*
\dt orders.*
\dt ai.*
```

### Backup Database

```powershell
# Run backup script
.\scripts\db-backup.ps1 -Container avengers_db -OutputDir .\backups

# Or manual backup
docker exec avengers_db pg_dump -U admin avengers_coffee > backup.sql
```

### Restore Database

```powershell
# Run restore script
.\scripts\db-restore.ps1 -SqlFile .\backups\avengers_coffee_20260322_002909.sql

# Or manual restore
docker exec -i avengers_db psql -U admin avengers_coffee < backup.sql
```

### Seed Test Data

```powershell
# Populate with behavior data for AI model training
.\scripts\seed-behavior-data.ps1
```

After seeding, AI models should have data to train on:
```bash
# Check model stats
curl http://localhost:3000/ai/model/stats
```

---

## Service Architecture

### Services Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (port 3000)                 │
│                  (NestJS + http-proxy)                     │
└────────────────────────────────────────────────────────────┘
                      │
    ┌─────────────────┼──────────────┬──────────────┬──────────┐
    ▼                 ▼              ▼              ▼          ▼
┌────────────┐  ┌─────────┐   ┌─────────┐   ┌──────────┐  ┌────────┐
│ Identity   │  │  Menu   │   │ Inventory│  │  Order   │  │ News   │
│ (3001)     │  │ (3003)  │   │ (3004)   │  │ (3005)   │  │(3006)  │
│ NestJS     │  │NestJS   │   │ NestJS   │  │ NestJS   │  │NestJS  │
│ TypeORM    │  │TypeORM  │   │ TypeORM  │  │ TypeORM  │  │TypeORM │
└────────────┘  └─────────┘   └─────────┘  │ WebSocket│  └────────┘
                                           │Redis     │
    ┌──────────────────────────────────────┼──────────┤
    │                                      │RabbitMQ  │
    │                                      └──────────┘
    │                              │
    │                              ▼
    │                        ┌──────────────┐
    │                        │ AI Service   │
    │                        │ (8000)       │
    │                        │ FastAPI      │
    │                        │ Python       │
    │                        └──────────────┘
    │                              │
    └──────────────────────────────┴─────────────────────┐
                                                         ▼
                            ┌────────────────────────────────┐
                            │   PostgreSQL (port 5433)       │
                            │  Shared Database               │
                            │  (isolated schemas per service)│
                            └────────────────────────────────┘
```

### Database Schemas
- `identity` — Users, roles, OAuth tokens, promotions
- `menu` — Products, categories
- `inventory` — Stock/materials per branch
- `orders` — Orders, payments, shippers, reviews, chat
- `news` — Articles, content
- `ai` — Model registry, inference logs

---

## Service Endpoints

### API Gateway (http://localhost:3000)
```
/auth/*              → Identity Service
/users/*             → Identity Service
/menu/*              → Menu Service
/inventory/*         → Inventory Service
/cart/*              → Order Service
/products/*          → Order Service
/orders/*            → Order Service
/ai/*                → AI Service
/news/*              → News Service
/uploads/*           → News Service
```

### AI Service Endpoints (http://localhost:8000/ai)
```
GET  /ai/model/stats                    # Model training status
GET  /ai/recommend/{user_id}?limit=3   # Product recommendations
GET  /ai/forecast/combined?branch=ALL  # Demand forecasting
GET  /ai/behavior/insights?branch=ALL  # Customer behavior analysis
POST /ai/chat                           # Gemini-powered chat
```

### Web Apps
```
Customer: http://localhost:5173        (React, Vite)
Admin:    http://localhost:5174        (React, Vite)
Shipper:  http://localhost:5175        (React, Vite)
Launcher: http://localhost:5176        (Vite)
Mobile:   Expo app (iOS/Android)
```

---

## Development Workflows

### Frontend Development

#### Web Customer
```bash
cd avengers-coffee-system/apps/web-customer

# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev
# Runs on http://localhost:5173

# Build for production
npm run build
# Output: dist/
```

#### Environment Variables (web-customer)
Edit `.env.local` or pass via docker build args:
```env
VITE_API_URL=http://localhost:3000        # API Gateway
VITE_SOCKET_URL=http://localhost:3005     # Order Service WebSocket
VITE_GOOGLE_CLIENT_ID=...                 # For Google OAuth
VITE_RECAPTCHA_SITE_KEY=...               # For reCAPTCHA
VITE_FACEBOOK_APP_ID=...                  # For Facebook login
```

### Backend Service Development

#### Order Service (most complex)
```bash
cd avengers-coffee-system/services/order-service

# Install dependencies
npm install

# Start dev server (watches for changes)
npm run start:dev
# Runs on http://localhost:3005

# Run tests
npm run test

# Build for production
npm run build
```

#### AI Service
```bash
cd avengers-coffee-system/services/ai-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run development server
python -m uvicorn main:app --reload --port 8000

# Run tests
pytest
```

---

## Testing & Validation

### Test AI Models
```bash
# Check model training status
curl http://localhost:3000/ai/model/stats | jq

# Get recommendations for a user
curl http://localhost:3000/ai/recommend/user_123 | jq

# Get demand forecast
curl http://localhost:3000/ai/forecast/combined?days=30 | jq

# Get behavior insights
curl http://localhost:3000/ai/behavior/insights | jq

# Test chat endpoint
curl -X POST http://localhost:3000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Tôi muốn gợi ý đồ uống",
    "user_id": "test_user_1",
    "user_name": "Khách Hàng"
  }' | jq
```

### Test Payment Webhook (Local)
```bash
# Simulate VNPay callback
curl -X GET "http://localhost:3000/customers/thanh-toan/don-hang/ORDER001/trang-thai" \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Test WebSocket (Chat & Notifications)
```bash
# Use wscat or similar tool
npm install -g wscat

# Connect to order service WebSocket
wscat -c http://localhost:3005
# Send: {"event": "subscribe", "room": "userId_123"}
```

---

## Troubleshooting

### Services Not Starting

```powershell
# Check if ports are already in use
netstat -ano | findstr :3000,3001,3005,8000,5173

# Kill process on port (example: port 3000)
Stop-Process -Id <PID> -Force
```

### Database Connection Error

```bash
# Verify PostgreSQL is healthy
docker-compose ps
# STATUS should show "Up" with health "healthy"

# Check logs
docker-compose logs avengers_db

# Manually connect
docker exec -it avengers_db psql -U admin -d avengers_coffee -c "SELECT 1"
```

### AI Service Not Training

```bash
# Check logs
docker-compose logs avengers_ai_service

# If "No real data", seed test data first
docker-compose exec postgres-db psql -U admin avengers_coffee < scripts/seed.sql

# Manually trigger retrain
curl -X POST http://localhost:3000/ai/recommend/train
curl -X POST http://localhost:3000/ai/forecast/train
```

### Gemini API Errors

```bash
# Verify API key is set
docker-compose exec avengers_ai_service env | grep GEMINI

# Check if key is valid by calling endpoint
curl -X POST http://localhost:3000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello", "user_id": "test"}'
```

---

## Performance Tuning

### Redis Caching
Cache is used for order status, cart data. Monitor hit rate:
```bash
docker exec avengers_redis redis-cli INFO stats
```

### Database Connection Pool
Configured in TypeORM services (default: 10 connections). Adjust if needed:
```typescript
// In service app.module.ts
TypeOrmModule.forRoot({
  poolSize: 20,  // Increase for high concurrency
})
```

### AI Model Training
Currently set to retrain every 60 minutes. Adjust:
```env
CF_AUTO_RETRAIN_MINUTES=60          # Collaborative Filter
CF_RETRAIN_QUEUE_COOLDOWN_SECONDS=120
```

---

## Deployment

### Production Build
```bash
# Build all images
docker-compose build

# Tag for registry
docker tag avengers_api_gateway myregistry.azurecr.io/api-gateway:latest

# Push to registry
docker push myregistry.azurecr.io/api-gateway:latest
```

### Using Kubernetes
See `avengers-coffee-system/deployments/` for sample K8s manifests.

---

## Common Commands

```bash
# View all containers
docker-compose ps

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f avengers_order_service

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild images (after code changes)
docker-compose build

# Restart a service
docker-compose restart avengers_order_service

# Execute command in container
docker-compose exec avengers_order_service npm run test
```

---

## Additional Resources

- [Docker Compose Docs](https://docs.docker.com/compose/)
- [NestJS Docs](https://docs.nestjs.com/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Docs](https://react.dev/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

**Last Updated**: May 29, 2026  
**Status**: ✅ Complete
