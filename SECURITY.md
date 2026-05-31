# Avengers Coffee - Security Hardening Guide

## Overview
This document identifies security concerns in the Avengers Coffee microservices system and provides recommendations to address them before production deployment.

---

## 🔴 CRITICAL ISSUES

### 1. **Weak Default Database Password**
- **Location**: `docker-compose.yml` (lines 10-11, 81-82, 103-104)
- **Issue**: Default password is `123` (hardcoded fallback)
- **Risk**: Direct database compromise
- **Fix**: 
  ```bash
  # Generate strong password
  openssl rand -base64 32
  # Set in .env:
  POSTGRES_PASSWORD=<generated_strong_password>
  ```

### 2. **Hardcoded VNPay Test Credentials**
- **Location**: `docker-compose.yml` (line 162)
- **Issue**: 
  - `VNPAY_HASH_SECRET: T718SPDGIGQSKGM98VCSNAF70M9X93MC` (test key exposed)
  - `VNPAY_TMN_CODE: MEBLXEDU` (test merchant code)
- **Risk**: Anyone can forge VNPay payment callbacks
- **Fix**:
  1. Remove from compose file
  2. Store in `.env` only:
     ```
     VNPAY_TMN_CODE=your_production_merchant_code
     VNPAY_HASH_SECRET=your_production_hash_secret
     ```
  3. Use `${VNPAY_HASH_SECRET}` in compose

### 3. **SePay Webhook Secret Placeholder**
- **Location**: `docker-compose.yml` (line 163)
- **Issue**: `SEPAY_WEBHOOK_SECRET: changeme-sepay-secret` (placeholder)
- **Risk**: Anyone can trigger false bank transfer notifications
- **Fix**: Generate and set in `.env`:
  ```
  SEPAY_WEBHOOK_SECRET=$(openssl rand -base64 32)
  ```

### 4. **Weak JWT Secret Fallback**
- **Location**: `docker-compose.yml` (lines 67, 155, 190)
- **Issue**: Default fallback is `avengers-jwt-secret` if `JWT_SECRET` not set
- **Risk**: Compromised token signatures and authentication bypass
- **Fix**: Always set in `.env`:
  ```
  JWT_SECRET=$(openssl rand -base64 32)
  ```

---

## 🟠 HIGH PRIORITY ISSUES

### 5. **Gemini API Key Accepted in Request Body (AI Service)**
- **Location**: `avengers-coffee-system/services/ai-service/main.py` (line 1017 - FIXED)
- **Previous Issue**: 
  ```python
  gemini_api_key = data.get("test_key") or os.getenv("GEMINI_API_KEY")
  ```
- **Risk**: API key exposure in logs, request forwarding, man-in-the-middle attacks
- **Status**: ✅ **PATCHED** - Now only reads from `GEMINI_API_KEY` env var

### 6. **Unprotected Redis Cache**
- **Location**: `docker-compose.yml` (line 31-37)
- **Issue**: Redis exposed on port 6379 with no authentication
- **Risk**: Cache poisoning, data theft, DOS
- **Fix**: 
  ```dockerfile
  # In docker-compose.yml, add password protection
  redis-cache:
    command: redis-server --requirepass ${REDIS_PASSWORD}
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
  
  # Then services connect with:
  redis://:{REDIS_PASSWORD}@redis-cache:6379
  ```

### 7. **RabbitMQ Default Credentials**
- **Location**: `docker-compose.yml` (line 39-50)
- **Issue**: Uses default guest/guest credentials
- **Risk**: Unauthorized message queue access, service disruption
- **Fix**:
  ```dockerfile
  rabbitmq:
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-admin}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
  
  # Set in .env:
  RABBITMQ_USER=admin
  RABBITMQ_PASSWORD=$(openssl rand -base64 32)
  ```

### 8. **CORS Wildcard Allow-All**
- **Location**: 
  - `api-gateway/gateway-root/src/main.ts` (line 10)
  - `order-service/src/main.ts` (line 6)
  - WebSocket: `order-service/notification.gateway.ts` (all origins)
- **Issue**: `app.enableCors()` with no restrictions + WebSocket `origin: '*'`
- **Risk**: CSRF attacks, unauthorized cross-origin requests
- **Fix**:
  ```typescript
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'https://avengers-coffee.com',  // production domain
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });
  ```

### 9. **No Rate Limiting on Gateway**
- **Location**: `api-gateway/gateway-root/src/main.ts`
- **Issue**: No throttle decorator or middleware
- **Risk**: DDoS, brute force attacks on auth endpoints
- **Fix**: Add `@nestjs/throttler`:
  ```typescript
  npm install @nestjs/throttler
  
  // In main.ts
  app.use(ThrottlerGuard);  // 5 requests per minute per IP
  ```

### 10. **WebSocket CORS Unrestricted**
- **Location**: `order-service/src/modules/notification/notification.gateway.ts`
- **Issue**: Socket.io configured with `origin: '*'`
- **Risk**: Unauthorized users can listen to all notifications
- **Fix**:
  ```typescript
  @WebSocketGateway({
    origin: ['http://localhost:5173', 'https://avengers-coffee.com'],
    credentials: true,
  })
  ```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 11. **Secrets in Compose File**
- **Location**: `docker-compose.yml` (various lines)
- **Issue**: Database password, internal tokens hardcoded with fallbacks
- **Risk**: Secrets in version control, visible to developers
- **Fix**: 
  - Always use `${VAR_NAME}` without fallback defaults for secrets
  - Document required env vars in `.env.example`
  - Add `.env` to `.gitignore`

### 12. **Insufficient Input Validation on Payment Webhooks**
- **Location**: `order-service/src/modules/thanh-toan/thanh-toan.controller.ts`
- **Issue**: VNPay/SePay webhook handlers may not validate all fields
- **Risk**: Payment status spoofing, order manipulation
- **Fix**: 
  - Validate HMAC signatures on all webhook payloads
  - Check timestamp (prevent replay attacks)
  - Verify amount matches order total
  - Log all webhook attempts

### 13. **Error Details Leaked in API Responses**
- **Location**: Multiple service error handlers
- **Issue**: Stack traces and SQL errors may be returned to clients
- **Risk**: Information disclosure for attack planning
- **Fix**: 
  ```typescript
  // Return generic error in production
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Internal server error' };
  }
  ```

### 14. **No HTTPS Enforced**
- **Location**: Service URLs hardcoded as `http://localhost`
- **Issue**: Plain HTTP allows man-in-the-middle attacks
- **Risk**: Session hijacking, credential theft
- **Fix**: 
  - Use HTTPS in production
  - Set `HTTPS=true` environment flag
  - Use `secure: true` for cookies

### 15. **Logging May Contain Sensitive Data**
- **Location**: AI service logs, Gateway logs, Service logs
- **Issue**: User IDs, order details, payment info may be logged
- **Risk**: Sensitive data exposure in log files
- **Fix**:
  ```typescript
  // Sanitize logs
  logger.info(`User login: ${maskEmail(email)}`);
  ```

---

## ✅ ALREADY FIXED / GOOD PRACTICES

- ✅ AI service: `test_key` removal (patched in this session)
- ✅ `.env.example` updated with placeholders and instructions
- ✅ Database schemas isolated per service
- ✅ JWT authentication on protected endpoints
- ✅ Role-based access control (ADMIN, MANAGER, STAFF, CUSTOMER)

---

## 🚀 PRODUCTION DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] **Secrets**: Generate and set `POSTGRES_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY`, `VNPAY_HASH_SECRET`, `SEPAY_WEBHOOK_SECRET`
- [ ] **Database**: Enable PostgreSQL SSL connections
- [ ] **Redis**: Add password authentication (`REDIS_PASSWORD`)
- [ ] **RabbitMQ**: Set custom credentials (`RABBITMQ_USER`, `RABBITMQ_PASSWORD`)
- [ ] **CORS**: Update to production domains only (not `*`)
- [ ] **Rate Limiting**: Deploy throttler middleware
- [ ] **WebSocket**: Restrict origins to known clients
- [ ] **HTTPS**: Enable TLS/SSL on all services
- [ ] **Logs**: Configure secure log storage (not on disk in containers)
- [ ] **Backups**: Database backup strategy (`scripts/db-backup.ps1`)
- [ ] **Monitoring**: Set up alerting for failed authentications, payment errors
- [ ] **Secrets Management**: Use HashiCorp Vault or AWS Secrets Manager instead of `.env` files
- [ ] **Penetration Testing**: Run security audit before production launch

---

## 📋 Quick Security Setup

```bash
# 1. Copy and edit .env
cp .env.example .env
# Edit .env and set all REQUIRED values marked with "your_*_here"

# 2. Generate secure secrets for .env
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
RABBITMQ_PASSWORD=$(openssl rand -base64 32)

# 3. Start with compose
docker-compose up -d

# 4. Verify services are healthy
docker-compose ps

# 5. Check logs for errors
docker-compose logs -f
```

---

## 📚 References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- NestJS Security: https://docs.nestjs.com/security
- FastAPI Security: https://fastapi.tiangolo.com/tutorial/security/
- Docker Security: https://docs.docker.com/engine/security/

---

**Last Updated**: May 29, 2026  
**Status**: 🟡 Partially Implemented (critical issues fixed, high/medium issues require code changes)
